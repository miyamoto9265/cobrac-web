## GN rules (this project)

These rules replace the two UC-count constraints of step 5. The validator checks them.

- The UCs of a GN are **connected among themselves** by ROI-internal connections (direction ignored): what the GN adds to its UCs is what their interaction computes. A UC on the way between two of them belongs in the GN too. When the UCs a sub-function needs are not connected, regroup them, or add the missing connection to `connections.json` if the literature reports it (HCD step 4).
- A GN holds **at most 2** UCs, or **3-4** when they form a motif that pairs cannot express (a loop, a feedforward triangle, or a convergence the literature describes as one computation). Then its `motifNote` says why the motif cannot be split into GNs of 2 UCs, with citations; the worker adds it to the GN Comments of the FRG sheet. Do not use it to avoid decomposing, and leave it out for a GN of 2 UCs or fewer. 5 or more UCs are never accepted.
- A GN whose children are only UCs has **at least 2** UCs; a UC has **at most 2** GN parents (unchanged).

```json
{
  "id": "R.Loop-Node", "subnodes": ["U.A", "U.B", "U.C"], "comment": "...", "interface": "...",
  "requirement": "...", "requirementRealization": "...", "capability": "...", "mechanism": "...",
  "motifNote": "U.A -> U.B -> U.C -> U.A is one recurrent loop: the persistent activity needs all three [Author, Year]"
}
```
