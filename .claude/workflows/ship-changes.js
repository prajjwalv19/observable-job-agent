export const meta = {
  name: 'ship-changes',
  description: 'Plan, implement, and independently review each changes-required.md item; squash-merge to main only on approval',
  phases: [
    { title: 'Plan' },
    { title: 'Implement' },
    { title: 'Review & Merge' },
  ],
}

// args: array of change-description strings, one per changes-required.md item.
// The main session reads/parses changes-required.md (this script has no filesystem
// access) and passes the parsed list in via Workflow({ scriptPath, args }).
const items = args

log(`Shipping ${items.length} change(s) from changes-required.md, one PR each.`)

const results = await pipeline(
  items,
  (item, _item, i) =>
    agent(
      `Plan this change to the observable-job-agent (Job Scout) repo.\n\nchanges-required.md item #${i + 1}:\n${item}`,
      { agentType: 'job-scout-planner', phase: 'Plan', label: `plan #${i + 1}` }
    ),
  (plan, item, i) =>
    agent(
      `Implement this change on its own branch, with passing tests.\n\nOriginal request:\n${item}\n\nPlan from the planning stage:\n${plan}`,
      {
        agentType: 'job-scout-implementer',
        phase: 'Implement',
        label: `implement #${i + 1}`,
        isolation: 'worktree', // parallel items must not collide on one working tree's checked-out branch
      }
    ),
  (implReport, item, i) =>
    agent(
      `Independently review this implementation. Re-run tests yourself. On APPROVE, open the PR and squash-merge it. On REJECT, do not merge — report exactly what's blocking.\n\nOriginal request:\n${item}\n\nImplementer's report:\n${implReport}`,
      {
        agentType: 'job-scout-reviewer',
        phase: 'Review & Merge',
        label: `review #${i + 1}`,
        isolation: 'worktree',
      }
    )
)

const outcomes = items.map((item, i) => ({ item, result: results[i] }))
const failed = outcomes.filter(o => o.result === null)
if (failed.length) {
  log(`${failed.length}/${items.length} item(s) hit a hard agent failure (not a review rejection) — see outcomes.`)
}

return outcomes
