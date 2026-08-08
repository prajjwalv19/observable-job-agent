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

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['APPROVE', 'REJECT'] },
    summary: { type: 'string', description: 'One or two sentences: what shipped, or exactly what is blocking' },
    merged: { type: 'boolean', description: 'True only if this reviewer actually ran gh pr merge successfully' },
    pr_url: { type: 'string', description: 'The PR URL, if one was opened (omit/empty if REJECT and no PR was opened)' },
    commit_sha: { type: 'string', description: 'The resulting squash-merge commit SHA on main, if merged' },
    artifact_path: { type: 'string', description: 'Repo-relative path to any non-code deliverable this change produced (e.g. a research doc) — separate from code files' },
  },
  required: ['verdict', 'summary', 'merged'],
}

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
      `Independently review this implementation. Re-run tests yourself. On APPROVE, open the PR and squash-merge it, then report the PR URL and merge commit SHA. On REJECT, do not merge — report exactly what's blocking. If main has moved and there's a real conflict with another item from this same batch, that is a REJECT (send back to rebase), not something to resolve yourself.\n\nOriginal request:\n${item}\n\nImplementer's report:\n${implReport}`,
      {
        agentType: 'job-scout-reviewer',
        phase: 'Review & Merge',
        label: `review #${i + 1}`,
        isolation: 'worktree',
        schema: REVIEW_SCHEMA,
      }
    )
)

const outcomes = items.map((item, i) => ({ item, review: results[i] }))
const failed = outcomes.filter(o => o.review === null)
const approved = outcomes.filter(o => o.review?.verdict === 'APPROVE' && o.review?.merged)
const rejected = outcomes.filter(o => o.review?.verdict === 'REJECT')

log(`${approved.length} merged, ${rejected.length} rejected (need a retry pass), ${failed.length} hard agent failure(s).`)

return outcomes
