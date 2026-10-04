## ROI rules (this project)

These rules extend steps 1, 3 and 4. The validator checks them.

**Elements of the ROI -> `meta.json` `roiElements`.** In step 1, split the ROI into the elements (regions) it consists of: each region the ROI names (`visual word form area and posterior fusiform gyrus` has two), or, for a ROI named as one system (`language network`), the regions you include in it with their evidence. In step 3, give **every element at least one ROI-internal UC that represents only that element**: never one UC for two elements (not one UC for the VWFA and the posterior fusiform gyrus). When the literature reports the elements only together, still define one UC per element (named by the UC naming rules), cite the joint evidence with relation `<`, and say so in the limitations. List each element with the Circuit IDs of its ROI-internal UCs (a Collection of them is fine) in `roiElements`; every ROI-internal UC belongs to an element.

**Side of the ROI -> `meta.json` `roiSide`, `roiSideSource`.** When the user's ROI or instructions name a side (left, right, a hemisphere, unilateral), use it: `roiSide` `left` / `right` (or `both` for bilateral), `roiSideSource` `user`. When they do not, the ROI covers **both sides**: `roiSide` `both`, `roiSideSource` `assumed`, and record the assumption in `decision_log.md` (e.g. `ROI side: not given by the user; treated as bilateral (both hemispheres)`). Do not pick a hemisphere yourself, even when the function is lateralized: under `both`, a ROI-internal UC is bilateral (no `side` facet), or its left and right UCs are both present (`A44d(left)` and `A44d(right)`), and a lateralization goes into the connections, Output Semantics and the report. Under `left` / `right`, ROI-internal UCs are on that side or bilateral.

```json
{ "roi": "visual word form area and posterior fusiform gyrus", "tlf": "...", "description": "...", "name": "...",
  "roiElements": [ { "name": "visual word form area", "ucs": ["<Circuit ID>"] }, { "name": "posterior fusiform gyrus", "ucs": ["<Circuit ID>"] } ],
  "roiSide": "both", "roiSideSource": "assumed" }
```

**One quote per connection (step 4).** `pointersOnLiterature` is the sentence that states *this* projection. Do not reuse one sentence (with the same figure, or none) for connections between different circuits: find the sentence or figure that states each projection, or cite another paper. The worker warns about a reused quote in `quote_check.json` (`reused`) and in the chat.
