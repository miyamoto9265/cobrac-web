-- CoBRAC's own records, in schema `cobrac` so they never collide with BRA-DB migrations.
-- cobrac.registrations: one row per registration attempt of a CoBRAC version (append-only). It is the provenance of
-- every CoBRAC project in BRA-DB: which version (version ID, content hash, parent) is in the tables, who asked,
-- which app made it, and what changed. Project IDs are stored as opaque strings.

CREATE SCHEMA IF NOT EXISTS cobrac;

CREATE TABLE IF NOT EXISTS cobrac.registrations (
  registration_id   BIGSERIAL PRIMARY KEY,
  project_id        VARCHAR(100) NOT NULL,
  project_key       INTEGER REFERENCES public.bradb_projects(project_key),
  version_id        TEXT         NOT NULL,
  version           INTEGER      NOT NULL,
  parent_version_id TEXT,
  content_sha256    CHAR(64)     NOT NULL,
  status            TEXT         NOT NULL,
  mode              TEXT         NOT NULL,
  reason            TEXT,
  counts            JSONB,
  changes           JSONB,
  skipped           JSONB,
  warnings          JSONB,
  provenance        JSONB        NOT NULL,
  package_manifest  JSONB        NOT NULL,
  requested_by      TEXT,
  registered_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reg_status CHECK (status IN ('registered', 'unchanged', 'rejected', 'failed')),
  CONSTRAINT chk_reg_mode CHECK (mode IN ('create', 'replace', 'none'))
);
CREATE INDEX IF NOT EXISTS idx_reg_project ON cobrac.registrations(project_id, registration_id DESC);
CREATE INDEX IF NOT EXISTS idx_reg_version ON cobrac.registrations(version_id);
CREATE INDEX IF NOT EXISTS idx_reg_hash    ON cobrac.registrations(content_sha256);

CREATE OR REPLACE FUNCTION cobrac.forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'cobrac.registrations is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_registrations_append_only ON cobrac.registrations;
CREATE TRIGGER trg_registrations_append_only BEFORE UPDATE OR DELETE ON cobrac.registrations
  FOR EACH ROW EXECUTE FUNCTION cobrac.forbid_change();

-- The CoBRAC version each BRA-DB project currently holds (latest successful registration).
CREATE OR REPLACE VIEW cobrac.current_versions AS
SELECT DISTINCT ON (r.project_id)
       r.project_id, p.project_key, r.version_id, r.version, r.parent_version_id, r.content_sha256,
       r.provenance->>'appVersion' AS app_version, r.provenance->>'gitSha' AS git_sha,
       r.provenance->>'sabraBoundary' AS sabra_boundary, r.registered_at, r.registration_id
FROM cobrac.registrations r
LEFT JOIN public.bradb_projects p ON p.project_id = r.project_id
WHERE r.status = 'registered'
ORDER BY r.project_id, r.registration_id DESC;
