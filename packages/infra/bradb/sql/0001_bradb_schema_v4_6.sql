-- BRA-DB schema v4.6 for the AWS instance (CoBRAC).
-- The end state of BRA-DB DDL v4.0 plus migrations 01-06 (v4.1-v4.6), written as one script so a new database is
-- built in one step. Table, column and constraint names are those of BRA-DB, so BRA-DB tools work unchanged.
-- Compare with a `pg_dump --schema-only` of bdbra's bra_db_v4_6 when one is available.

CREATE EXTENSION IF NOT EXISTS age;
SET search_path = ag_catalog, "$user", public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_graph WHERE name = 'bradb_graph') THEN
    PERFORM ag_catalog.create_graph('bradb_graph');
  END IF;
END $$;

SET search_path = public, ag_catalog;

CREATE TABLE IF NOT EXISTS bradb_projects (
  project_key      SERIAL PRIMARY KEY,
  project_id       VARCHAR(100) NOT NULL UNIQUE,
  project_kind     VARCHAR(10)  NOT NULL DEFAULT 'bra',
  roi_circuit_id   VARCHAR(100) NOT NULL,
  roi_label        VARCHAR(200),
  tlf_description  TEXT,
  tlf_label        VARCHAR(200),
  contributor      VARCHAR(200) NOT NULL,
  contributors     TEXT,
  description      TEXT,
  root_node_id     VARCHAR(200),
  source_file      VARCHAR(500),
  import_status    VARCHAR(20)  NOT NULL DEFAULT 'imported',
  cobrac_generated BOOLEAN      NOT NULL DEFAULT FALSE,
  cultivate_source VARCHAR(50),
  version          INTEGER      NOT NULL DEFAULT 1,
  sheet_headers    JSONB,
  sheet_meta       JSONB,
  public_comment   TEXT,
  bra_version      VARCHAR(50),
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_proj_kind CHECK (project_kind IN ('bra', 'bif')),
  CONSTRAINT chk_proj_tlf_required CHECK (project_kind <> 'bra' OR tlf_description IS NOT NULL),
  CONSTRAINT chk_proj_import_status CHECK (import_status IN ('imported', 'validated', 'published', 'deprecated')),
  CONSTRAINT chk_proj_cultivate CHECK (cultivate_source IS NULL OR cultivate_source IN ('HARVEST', 'GRAFT'))
);
CREATE INDEX IF NOT EXISTS idx_proj_roi         ON bradb_projects(roi_circuit_id);
CREATE INDEX IF NOT EXISTS idx_proj_contributor ON bradb_projects(contributor);
CREATE INDEX IF NOT EXISTS idx_proj_cobrac      ON bradb_projects(cobrac_generated);
CREATE INDEX IF NOT EXISTS idx_proj_status      ON bradb_projects(import_status);
CREATE INDEX IF NOT EXISTS idx_proj_kind        ON bradb_projects(project_kind);

CREATE TABLE IF NOT EXISTS bradb_local_circuits (
  local_circuit_key  SERIAL PRIMARY KEY,
  circuit_id         VARCHAR(100) NOT NULL UNIQUE,
  circuit_kind       VARCHAR(10)  NOT NULL DEFAULT 'local',
  source_of_id       VARCHAR(20),
  names              TEXT,
  graph_order        NUMERIC,
  is_uniform         BOOLEAN      NOT NULL DEFAULT FALSE,
  transmitter        VARCHAR(50),
  modulation_type    VARCHAR(20),
  sub_circuit_ids    JSONB,
  size               TEXT,
  output_semantics_0 TEXT,
  physiological_data TEXT,
  comments           TEXT,
  region             VARCHAR(100),
  layer              VARCHAR(20),
  approval_status    VARCHAR(20)  NOT NULL DEFAULT 'unverified',
  approval_source    VARCHAR(100),
  verified_at        TIMESTAMP,
  origin_project_key INTEGER REFERENCES bradb_projects(project_key) ON DELETE SET NULL,
  extra              JSONB,
  source_row_no      INTEGER,
  contributor        VARCHAR(200) NOT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_lc_kind CHECK (circuit_kind IN ('local', 'bif')),
  CONSTRAINT chk_lc_approval_status CHECK (approval_status IN ('approved', 'provisional', 'unverified')),
  CONSTRAINT chk_lc_approval_source CHECK (approval_status = 'unverified' OR approval_source IS NOT NULL),
  CONSTRAINT chk_lc_source_of_id CHECK (source_of_id IS NULL OR source_of_id IN ('makeshift', 'collection', 'reference', 'dhba', 'mba', 'uberon', 'bna')),
  CONSTRAINT chk_lc_modulation_type CHECK (modulation_type IS NULL OR modulation_type IN ('Excitatory', 'Inhibitory', 'Modulatory'))
);
CREATE INDEX IF NOT EXISTS idx_lc_source       ON bradb_local_circuits(source_of_id);
CREATE INDEX IF NOT EXISTS idx_lc_sub_circuits ON bradb_local_circuits USING GIN(sub_circuit_ids);
CREATE INDEX IF NOT EXISTS idx_lc_kind         ON bradb_local_circuits(circuit_kind);
CREATE INDEX IF NOT EXISTS idx_lc_region       ON bradb_local_circuits(region);
CREATE INDEX IF NOT EXISTS idx_lc_approval     ON bradb_local_circuits(approval_status, approval_source);
CREATE INDEX IF NOT EXISTS idx_lc_origin       ON bradb_local_circuits(origin_project_key);
CREATE INDEX IF NOT EXISTS idx_lc_extra        ON bradb_local_circuits USING GIN(extra);

CREATE TABLE IF NOT EXISTS bradb_literature (
  literature_key  SERIAL PRIMARY KEY,
  literature_id   VARCHAR(100) NOT NULL UNIQUE,
  doi             VARCHAR(200) UNIQUE,
  title           TEXT,
  authors         TEXT,
  journal_name    TEXT,
  year            INTEGER,
  literature_type VARCHAR(100),
  bibtex          TEXT,
  url             VARCHAR(500),
  title_hash      VARCHAR(32),
  extra           JSONB,
  source_row_no   INTEGER,
  contributor     VARCHAR(200) NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lit_doi   ON bradb_literature(doi) WHERE doi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lit_year  ON bradb_literature(year);
CREATE INDEX IF NOT EXISTS idx_lit_hash  ON bradb_literature(title_hash) WHERE title_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lit_extra ON bradb_literature USING GIN(extra);

CREATE TABLE IF NOT EXISTS bradb_project_literature (
  pl_key         SERIAL PRIMARY KEY,
  project_key    INTEGER      NOT NULL REFERENCES bradb_projects(project_key),
  literature_key INTEGER      NOT NULL REFERENCES bradb_literature(literature_key),
  usage_context  TEXT,
  contributor    VARCHAR(200) NOT NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (project_key, literature_key)
);
CREATE INDEX IF NOT EXISTS idx_pl_project    ON bradb_project_literature(project_key);
CREATE INDEX IF NOT EXISTS idx_pl_literature ON bradb_project_literature(literature_key);

CREATE TABLE IF NOT EXISTS bradb_bra_node_history (
  history_key      SERIAL PRIMARY KEY,
  node_id          VARCHAR(200) NOT NULL,
  project_key      INTEGER      NOT NULL REFERENCES bradb_projects(project_key),
  version          INTEGER      NOT NULL,
  node_role        VARCHAR(20)  NOT NULL,
  capability       TEXT,
  requirements     TEXT,
  output_semantics TEXT,
  interface        TEXT,
  implementation   TEXT,
  mechanism        TEXT,
  region_category  VARCHAR(20),
  change_type      VARCHAR(20)  NOT NULL,
  changed_by       VARCHAR(200) NOT NULL,
  change_note      TEXT,
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bnh_node_role CHECK (node_role IN ('Requirement', 'Capability', 'Uniform', 'Assembly')),
  CONSTRAINT chk_bnh_region_category CHECK (region_category IS NULL OR region_category IN ('ROI', 'inROI', 'Input', 'Output', 'Input/Output', 'outROI')),
  CONSTRAINT chk_bnh_change_type CHECK (change_type IN ('create', 'update', 'ai_revision', 'merge', 'import'))
);
CREATE INDEX IF NOT EXISTS idx_bnh_node    ON bradb_bra_node_history(node_id);
CREATE INDEX IF NOT EXISTS idx_bnh_project ON bradb_bra_node_history(project_key);
CREATE INDEX IF NOT EXISTS idx_bnh_version ON bradb_bra_node_history(node_id, version);

CREATE TABLE IF NOT EXISTS bradb_review_comments (
  comment_key  SERIAL PRIMARY KEY,
  project_key  INTEGER REFERENCES bradb_projects(project_key),
  node_id      VARCHAR(200),
  comment_text TEXT         NOT NULL,
  commented_by VARCHAR(200) NOT NULL,
  ai_response  TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'open',
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rc_status CHECK (status IN ('open', 'addressed', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_rc_project ON bradb_review_comments(project_key);
CREATE INDEX IF NOT EXISTS idx_rc_node    ON bradb_review_comments(node_id);
CREATE INDEX IF NOT EXISTS idx_rc_status  ON bradb_review_comments(status);

CREATE TABLE IF NOT EXISTS bradb_import_log (
  log_key          SERIAL PRIMARY KEY,
  project_key      INTEGER      NOT NULL REFERENCES bradb_projects(project_key),
  import_type      VARCHAR(20)  NOT NULL,
  agent            VARCHAR(200) NOT NULL,
  source_path      VARCHAR(500),
  records_inserted INTEGER,
  records_skipped  INTEGER,
  notes            TEXT,
  imported_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_il_import_type CHECK (import_type IN ('manual', 'cobrac', 'cultivate', 'batch'))
);
CREATE INDEX IF NOT EXISTS idx_il_project ON bradb_import_log(project_key);
CREATE INDEX IF NOT EXISTS idx_il_type    ON bradb_import_log(import_type);

CREATE TABLE IF NOT EXISTS bradb_connections (
  connection_key         SERIAL PRIMARY KEY,
  project_key            INTEGER      NOT NULL REFERENCES bradb_projects(project_key),
  source_row_no          INTEGER,
  sender_circuit_id      VARCHAR(100) NOT NULL,
  receiver_circuit_id    VARCHAR(100) NOT NULL,
  sender_relation        VARCHAR(10),
  receiver_relation      VARCHAR(10),
  sender_notation        TEXT,
  receiver_notation      TEXT,
  reference_id           VARCHAR(100),
  taxon                  VARCHAR(100),
  measurement_method     TEXT,
  pointers_on_literature TEXT,
  pointers_on_figure     TEXT,
  in_depth_literature    TEXT,
  size                   TEXT,
  comments               TEXT,
  derived_flow           VARCHAR(20),
  approval_status        VARCHAR(20)  NOT NULL DEFAULT 'unverified',
  approval_source        VARCHAR(100),
  verified_at            TIMESTAMP,
  contributor            VARCHAR(200),
  extra                  JSONB,
  created_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conn_relation CHECK ((sender_relation IS NULL OR sender_relation IN ('=', '<', '>')) AND (receiver_relation IS NULL OR receiver_relation IN ('=', '<', '>'))),
  CONSTRAINT chk_conn_approval_status CHECK (approval_status IN ('approved', 'provisional', 'unverified'))
);
CREATE INDEX IF NOT EXISTS idx_conn_project  ON bradb_connections(project_key);
CREATE INDEX IF NOT EXISTS idx_conn_sender   ON bradb_connections(sender_circuit_id);
CREATE INDEX IF NOT EXISTS idx_conn_receiver ON bradb_connections(receiver_circuit_id);
CREATE INDEX IF NOT EXISTS idx_conn_ref      ON bradb_connections(reference_id);
CREATE INDEX IF NOT EXISTS idx_conn_approval ON bradb_connections(approval_status, approval_source);
CREATE INDEX IF NOT EXISTS idx_conn_extra    ON bradb_connections USING GIN(extra);

CREATE TABLE IF NOT EXISTS bradb_bra_nodes (
  bra_node_key     SERIAL PRIMARY KEY,
  project_key      INTEGER      NOT NULL REFERENCES bradb_projects(project_key) ON DELETE CASCADE,
  node_id          VARCHAR(200) NOT NULL,
  source_row_no    INTEGER,
  node_role        VARCHAR(20)  NOT NULL,
  capability       TEXT,
  requirements     TEXT,
  output_semantics TEXT,
  interface        TEXT,
  implementation   TEXT,
  mechanism        TEXT,
  region_category  VARCHAR(20),
  circuit_id       VARCHAR(100),
  comments         TEXT,
  extra            JSONB,
  current_version  INTEGER      NOT NULL DEFAULT 1,
  contributor      VARCHAR(200),
  created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (project_key, node_id),
  CONSTRAINT chk_bn_node_role CHECK (node_role IN ('Requirement', 'Capability', 'Uniform', 'Assembly')),
  CONSTRAINT chk_bn_region_category CHECK (region_category IS NULL OR region_category IN ('ROI', 'inROI', 'Input', 'Output', 'Input/Output', 'outROI'))
);
CREATE INDEX IF NOT EXISTS idx_bn_project ON bradb_bra_nodes(project_key);
CREATE INDEX IF NOT EXISTS idx_bn_node    ON bradb_bra_nodes(node_id);
CREATE INDEX IF NOT EXISTS idx_bn_role    ON bradb_bra_nodes(node_role);
CREATE INDEX IF NOT EXISTS idx_bn_circuit ON bradb_bra_nodes(circuit_id);
CREATE INDEX IF NOT EXISTS idx_bn_extra   ON bradb_bra_nodes USING GIN(extra);

CREATE OR REPLACE VIEW bradb_circuits AS
SELECT local_circuit_key AS circuit_key, circuit_id, circuit_kind, origin_project_key, region, layer, is_uniform,
       sub_circuit_ids, names, graph_order, source_of_id, transmitter, modulation_type, approval_status,
       approval_source, verified_at, contributor, created_at, updated_at
FROM bradb_local_circuits;
