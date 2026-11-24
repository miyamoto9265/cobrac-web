# NOTICE

CoBRAC Agents (this repository and https://cobrac.site/) uses the following third-party data.

## HOMBA (Harmonized Ontology of Mammalian Brain Anatomy)

- Provider: Allen Institute
- License: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
- Source: [HOMBA ontology (CCF-MAP)](https://alleninstitute.github.io/CCF-MAP/docs/HOMBA_ontology_v1.html), [Allen Brain Knowledge Platform](https://knowledge.brain-map.org/data/4OGSMDGXKB34DVKGTJW) (RRID:SCR_027628)
- Paper: Ding, S.-L., Bhandiwad, A. A., Rosen, B. Q., Seeman, S. C., et al. (2026). Harmonized brain ontology and 3D atlases for human, macaque, and marmoset basal ganglia. *Cell*, 189(23). https://doi.org/10.1016/j.cell.2026.10.033
- Where it appears: HOMBA IDs (`HOMBA:<id>`), DHBA names and acronyms, and the region hierarchy in the agent prompts (`prompts/`), source code, tests and fixtures, figures in `docs/`, and the BRA data that CoBRAC generates
- Changes: CoBRAC reads HOMBA through ROSETTA Candidate Search (RCS, [miyamoto9265/rosetta-candidate-search](https://github.com/miyamoto9265/rosetta-candidate-search)), which corrects some typos in the HOMBA v1 CSV and adds its own subdivisions (HOMEX) and search aliases. These changes are not made or endorsed by the Allen Institute

HOMBA is derived from the Allen Developing Human Brain Atlas (DHBA) ontology; the DHBA names CoBRAC uses are the ones in the HOMBA CSV.

### Suggested credit line

> Brain region terms are from the Allen Institute's Harmonized Ontology of Mammalian Brain Anatomy (HOMBA; RRID:SCR_027628), licensed under CC BY 4.0. Some terms were corrected or added by ROSETTA Candidate Search.

日本語:

> 脳領域の用語は Allen Institute の HOMBA（Harmonized Ontology of Mammalian Brain Anatomy、RRID:SCR_027628）によるもので、CC BY 4.0 で提供されています。一部の用語は ROSETTA Candidate Search で修正・追加しています。
