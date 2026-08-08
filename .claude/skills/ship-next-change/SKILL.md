---
name: ship-next-change
description: Find the next unfinished item in changes-required.md and run it through plan, implement, and review/merge — one item per invocation, no concurrency, run again for the next one.
disable-model-invocation: true
allowed-tools: Agent(job-scout-planner, job-scout-implementer, job-scout-reviewer) Read Edit Bash
---

# Ship the next open change

This repo's change list lives one directory above the repo, at `/mnt/d/Coding/llmProjects/job-hunt/changes-required.md`. Items already shipped are struck through (`~~...~~`) with a note underneath giving the merged PR URL / artifact path. Follow these steps exactly, in order, for **one item only** — do not batch multiple items in a single invocation (that's what caused merge-conflict risk between related items; this skill exists specifically to avoid that by keeping `main` clean between items).

1. **Read** `/mnt/d/Coding/llmProjects/job-hunt/changes-required.md`. Find the first numbered item whose heading is **not** struck through. If every item is struck through, report "no open items in changes-required.md" and stop here — do not proceed.

2. **Plan.** Call the `Agent` tool with `subagent_type: "job-scout-planner"`, giving it the full text of that item (heading + all its sub-bullets) plus: "This is item #N of changes-required.md in the observable-job-agent repo."

3. **Implement.** Call `Agent` with `subagent_type: "job-scout-implementer"`, passing the original item text and the planner's output verbatim.

4. **Review & merge.** Call `Agent` with `subagent_type: "job-scout-reviewer"`, passing the original item text and the implementer's final report verbatim. Its instructions already cover: independently re-verifying tests, opening the PR and squash-merging **only** on APPROVE, never merging on REJECT.

5. **Update the tracker** — this step is yours, not any subagent's (the file lives outside the repo the subagents work in):
   - **On APPROVE + merged**: Edit `changes-required.md` — wrap that item's heading line in strikethrough (`~~1. JSearch API params~~`), and add a line directly under it: `> Shipped: <PR URL> (commit <short SHA>)` — and if the reviewer reported an `artifact_path` (e.g. a research doc), add a second line `> Artifact: <path>`. Leave the sub-bullets as-is underneath (don't strike those individually, just the heading).
   - **On REJECT**: Do not touch `changes-required.md` — the item stays open. Report the rejection reason to the user plainly so they can decide whether to re-run this skill (retry as-is), adjust the item's wording first, or handle it manually.

6. **Report to the user**: which item was processed, the verdict, and (if merged) the PR link — then stop. Do not automatically proceed to the next item; the user runs this skill again when ready for the next one.
