-- Every vertex and edge label of bradb_graph, created up front so the import role never needs to create labels
-- (creating one needs rights on ag_catalog that only the owner has).
SET search_path = ag_catalog, "$user", public;

DO $$
DECLARE
  v text;
  e text;
BEGIN
  FOREACH v IN ARRAY ARRAY['BRANode', 'LocalCircuit', 'BIFCircuit'] LOOP
    IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_label l JOIN ag_catalog.ag_graph g ON g.graphid = l.graph WHERE g.name = 'bradb_graph' AND l.name = v) THEN
      PERFORM ag_catalog.create_vlabel('bradb_graph'::cstring, v::cstring);
    END IF;
  END LOOP;
  FOREACH e IN ARRAY ARRAY['SUBNODE', 'PROJECTS_TO', 'MAPS_TO_BIF', 'MAPS_TO_LOCAL', 'PROJECTS', 'HAS_SUBCIRCUIT'] LOOP
    IF NOT EXISTS (SELECT 1 FROM ag_catalog.ag_label l JOIN ag_catalog.ag_graph g ON g.graphid = l.graph WHERE g.name = 'bradb_graph' AND l.name = e) THEN
      PERFORM ag_catalog.create_elabel('bradb_graph'::cstring, e::cstring);
    END IF;
  END LOOP;
END $$;
