#!/usr/bin/env bash
# BRA-DB instance bootstrap (Ubuntu 24.04, arm64 or amd64). Runs at every boot from the instance user data and is
# idempotent: installs PostgreSQL 17 + Apache AGE from PGDG, puts the cluster on the data volume, sets the roles'
# passwords from Secrets Manager and applies the SQL files in sql/ that have not been applied yet.
#
# Settings come from /etc/bradb/bradb.env (written by the user data):
#   AWS_REGION, BRADB_VOLUME_ID, BRADB_ALLOWED_CIDR, BRADB_SECRET_OWNER, BRADB_SECRET_IMPORT, BRADB_SECRET_READ
# Test mode (BRADB_TEST=1): no data volume (the cluster stays in /var/lib), passwords from
#   BRADB_TEST_PASSWORD, connections from BRADB_ALLOWED_CIDR (default 127.0.0.1/32).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
[ -f /etc/bradb/bradb.env ] && . /etc/bradb/bradb.env
export DEBIAN_FRONTEND=noninteractive
DB=bra_db_v4_6
PGVER=17
DATA_MOUNT=/srv/bradb
log() { echo "[bradb] $(date -u +%FT%TZ) $*"; }

install_packages() {
  if dpkg -s "postgresql-$PGVER-age" >/dev/null 2>&1; then return; fi
  log "installing PostgreSQL $PGVER and Apache AGE"
  apt-get update -q
  apt-get install -y -q curl ca-certificates gnupg jq unzip
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    >/etc/apt/sources.list.d/pgdg.list
  apt-get update -q
  # the PGDG package creates a default cluster; it is replaced by the one on the data volume below
  apt-get install -y -q "postgresql-$PGVER" "postgresql-$PGVER-age"
}

install_awscli() {
  [ "${BRADB_TEST:-}" = 1 ] && return
  command -v aws >/dev/null 2>&1 && return
  log "installing the AWS CLI"
  snap install aws-cli --classic
}

mount_data_volume() {
  [ "${BRADB_TEST:-}" = 1 ] && return
  local dev="/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${BRADB_VOLUME_ID//-/}"
  for _ in $(seq 1 120); do [ -e "$dev" ] && break; sleep 5; done
  [ -e "$dev" ] || { log "data volume $BRADB_VOLUME_ID is not attached"; exit 1; }
  if ! blkid "$dev" >/dev/null 2>&1; then
    log "formatting the new data volume"
    mkfs.ext4 -q -L bradb-data "$dev"
  fi
  mkdir -p "$DATA_MOUNT"
  if ! grep -q "LABEL=bradb-data" /etc/fstab; then
    echo "LABEL=bradb-data $DATA_MOUNT ext4 defaults,nofail 0 2" >>/etc/fstab
  fi
  mountpoint -q "$DATA_MOUNT" || mount "$DATA_MOUNT"
}

setup_cluster() {
  local datadir
  if [ "${BRADB_TEST:-}" = 1 ]; then datadir="/var/lib/postgresql/$PGVER/main"; else datadir="$DATA_MOUNT/pg$PGVER"; fi
  local current
  current="$(pg_lsclusters -h 2>/dev/null | awk -v v="$PGVER" '$1==v && $2=="main" {print $6}')"
  if [ "$current" != "$datadir" ]; then
    if [ -n "$current" ]; then
      log "dropping the package's default cluster ($current)"
      pg_dropcluster --stop "$PGVER" main
    fi
    if [ -f "$datadir/PG_VERSION" ]; then
      log "registering the existing cluster in $datadir"
    else
      log "creating the cluster in $datadir"
      install -d -o postgres -g postgres "$(dirname "$datadir")"
    fi
    pg_createcluster "$PGVER" main -d "$datadir" -- --auth-local=peer --auth-host=scram-sha-256 >/dev/null
  fi
  local conf="/etc/postgresql/$PGVER/main"
  cat >"$conf/conf.d/bradb.conf" <<EOF
listen_addresses = '*'
shared_preload_libraries = 'age'
password_encryption = 'scram-sha-256'
max_connections = 50
EOF
  local cidr="${BRADB_ALLOWED_CIDR:-127.0.0.1/32}"
  cat >"$conf/pg_hba.conf" <<EOF
local   all  postgres                 peer
local   all  all                      peer
host    all  all       127.0.0.1/32   scram-sha-256
host    all  all       ::1/128        scram-sha-256
host    all  all       $cidr          scram-sha-256
EOF
  systemctl enable "postgresql@$PGVER-main" >/dev/null 2>&1 || true
  pg_ctlcluster "$PGVER" main status >/dev/null 2>&1 && pg_ctlcluster "$PGVER" main restart || pg_ctlcluster "$PGVER" main start
}

psql_su() { sudo -u postgres psql -v ON_ERROR_STOP=1 -qAt "$@"; }

secret_password() {
  if [ "${BRADB_TEST:-}" = 1 ]; then echo "${BRADB_TEST_PASSWORD:?}"; return; fi
  aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$1" --query SecretString --output text | jq -r .password
}

setup_roles() {
  local role secret pw
  for pair in "bra:${BRADB_SECRET_OWNER:-}" "cobrac_import:${BRADB_SECRET_IMPORT:-}" "cobrac_read:${BRADB_SECRET_READ:-}"; do
    role="${pair%%:*}"
    secret="${pair#*:}"
    pw="$(secret_password "$secret")"
    psql_su -d postgres -v role="$role" -v pw="$pw" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'role') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'role', :'pw') \gexec
SQL
  done
  psql_su -d postgres -c "SELECT 1 FROM pg_database WHERE datname = '$DB'" | grep -q 1 || psql_su -d postgres -c "CREATE DATABASE $DB OWNER bra"
}

apply_migrations() {
  psql_su -d "$DB" -c "CREATE SCHEMA IF NOT EXISTS cobrac; CREATE TABLE IF NOT EXISTS cobrac.schema_migrations (name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
  local f name sha applied
  for f in "$HERE"/sql/*.sql; do
    name="$(basename "$f")"
    sha="$(sha256sum "$f" | cut -d' ' -f1)"
    applied="$(psql_su -d "$DB" -c "SELECT sha256 FROM cobrac.schema_migrations WHERE name = '$name'")"
    if [ -z "$applied" ]; then
      log "applying $name"
      { echo "BEGIN;"; cat "$f"; echo; echo "INSERT INTO cobrac.schema_migrations (name, sha256) VALUES ('$name', '$sha');"; echo "COMMIT;"; } | psql_su -d "$DB"
    elif [ "$applied" != "$sha" ]; then
      # grants are re-runnable; any other applied file must not change (add a new file instead)
      case "$name" in
        *_grants.sql) log "re-applying $name"; { echo "BEGIN;"; cat "$f"; echo; echo "UPDATE cobrac.schema_migrations SET sha256 = '$sha', applied_at = NOW() WHERE name = '$name';"; echo "COMMIT;"; } | psql_su -d "$DB" ;;
        *) log "WARNING: $name changed after it was applied; not re-applied" ;;
      esac
    fi
  done
}

main() {
  log "bootstrap start"
  install_packages
  install_awscli
  mount_data_volume
  setup_cluster
  setup_roles
  apply_migrations
  log "bootstrap done"
}

main "$@"
