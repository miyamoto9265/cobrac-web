-- Roles (created by bootstrap.sh from Secrets Manager): bra = owner, cobrac_import = the registration Lambda,
-- cobrac_read = read-only. cobrac_import cannot delete projects, import logs, node history or registrations, so a
-- registration can never remove history.

ALTER DATABASE bra_db_v4_6 OWNER TO bra;
-- bra owns BRA-DB's tables so BRA-DB migrations can be run as bra
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname IN ('public', 'cobrac') AND c.relkind IN ('r', 'S', 'v') LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO bra', CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' ELSE 'TABLE' END, r.nspname, r.relname);
  END LOOP;
END $$;
ALTER SCHEMA cobrac OWNER TO bra;
GRANT ALL ON SCHEMA public, cobrac, bradb_graph TO bra;
GRANT USAGE ON SCHEMA ag_catalog TO bra;
GRANT ALL ON ALL TABLES IN SCHEMA public, cobrac, bradb_graph TO bra;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public, cobrac, bradb_graph TO bra;
GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO bra;

GRANT CONNECT ON DATABASE bra_db_v4_6 TO cobrac_import, cobrac_read;
GRANT USAGE ON SCHEMA public, cobrac, ag_catalog, bradb_graph TO cobrac_import, cobrac_read;

GRANT SELECT ON ALL TABLES IN SCHEMA public, cobrac, ag_catalog, bradb_graph TO cobrac_read;

GRANT SELECT ON ALL TABLES IN SCHEMA ag_catalog TO cobrac_import;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO cobrac_import;
GRANT INSERT, UPDATE ON bradb_projects, bradb_literature TO cobrac_import;
GRANT INSERT, UPDATE, DELETE ON bradb_local_circuits, bradb_connections, bradb_bra_nodes, bradb_project_literature TO cobrac_import;
GRANT INSERT ON bradb_bra_node_history, bradb_import_log TO cobrac_import;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cobrac_import;
GRANT SELECT, INSERT ON cobrac.registrations TO cobrac_import;
GRANT SELECT ON cobrac.current_versions TO cobrac_import;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cobrac TO cobrac_import;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA bradb_graph TO cobrac_import;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA bradb_graph TO cobrac_import;

ALTER ROLE cobrac_import SET search_path = public, ag_catalog;
ALTER ROLE cobrac_read SET search_path = public, ag_catalog;
