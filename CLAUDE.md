# Job Scout (observable-job-agent)

CV → extracted profile → live job search (JSearch/Adzuna/Remotive/offline cache) → ranked 0-100 with fit explanations → (Phase 2) tailored CV + cover letter, validated against fabrication. LangGraph + Opik (tracing) + Gradio (UI). Full background/architecture: `docs/architecture.md`, `docs/phase1_findings.md`, `docs/phase2_findings.md`, `docs/phase3_findings.md`.

This is a fork of `jamwithai/observable-job-agent` (`upstream` remote) being customized for a real live handoff, not the reference/tutorial repo — treat findings/quirks below as load-bearing, not trivia.

## Commands
- `make test` — full suite, offline, no API keys needed. Run before considering any change done.
- `make lint` / `make format` — ruff.
- `make app` — Gradio UI at localhost:7860. **Must be launched with `.env` exported into the real process environment first** (see gotcha below) — `set -a; source .env; set +a; make app`, not bare `make app`.
- `make batch` / `make tailor-batch` — deliberately stay off JSearch (Adzuna + offline cache only), to protect its small quota. Don't add JSearch calls to these paths.
- `make search-bench` — burns ~20 live JSearch calls per run (5 repeats × 2 modes × 2 cases). Don't run casually once a real JSearch key is configured.

## Conventions
- Settings: single `pydantic-settings` `BaseSettings` in `src/job_scout/config.py`, fields as `Field(default=..., alias="ENV_VAR_NAME")`, secrets as `SecretStr`. Every new env var also gets a commented, empty entry in `.env.example` — never a real value.
- Graph nodes: plain functions in `src/job_scout/graph/nodes/`, take `AgentState`, return a partial-state `dict`. Prompt text lives separately in `src/job_scout/graph/prompts/`.
- Job-source adapters (`src/job_scout/tools/jobs_api.py`): each has `.available` (bool) and `.fetch(query, location, country, remote, limit) -> list[JobPosting]`, and fails to `[]` on any error rather than raising — a dead source must never crash a search.
- Tests mock at the adapter/LLM-client boundary; nothing in `tests/` should make a real network or LLM call.

## Real gotchas found while setting this up (all cost real debugging time — don't rediscover them)

1. **`.env` is not exported to the real process environment.** `pydantic-settings` reads `.env` into the `Settings` object only. Anything that reads `os.environ` directly for its own client init — notably `langchain-groq`'s `ChatGroq` via `init_chat_model("groq:...")` — will not see `GROQ_API_KEY` unless it's a real shell env var. `make app` on its own will fail with "the api_key client option must be set..." even with a correct `.env`. Always `set -a; source .env; set +a` before `make app`, or export the specific keys needed. (OpenAI has a workaround for this already — `_export_openai_key()` in `llm.py` — Groq does not.)

2. **Small/fast Groq models are unreliable at tool-calling.** `SCOUT_FETCH_MODEL` was originally set to `groq:llama-3.1-8b-instant` for latency (the `search_jobs` tool-arg call is trivial). It threw `BadRequestError: tool_use_failed` on a real CV with a long, multi-domain query. Fixed by pointing `SCOUT_FETCH_MODEL` at the same reliable model as `SCOUT_MODEL` (`groq:llama-3.3-70b-versatile`). Don't reintroduce a small model on any tool-calling path without a documented reason.

3. **Groq free-tier limits are TPM-bound, not RPM-bound, for this workload.** `llama-3.3-70b-versatile` free tier: 30 RPM / 1K RPD / **12K TPM** / 100K TPD. `rank_jobs` fires up to 4 parallel batches; at `SCOUT_MAX_JOBS=25` (~7 batches × ~2.5K tokens) you cross 12K TPM in one burst before hitting the request-count breaker. Current safe setting: `SCOUT_MAX_JOBS=16`, `MAX_LLM_CALLS_PER_RUN=20`. Don't raise `SCOUT_MAX_JOBS` without re-checking this math.

4. **JSearch: two completely different products share the name.** The code's `JSearchSource` originally targeted OpenWeb Ninja's *direct* API (`api.openwebninja.com`, header `X-API-Key`). A key obtained via the **RapidAPI marketplace listing** is a different product (`jsearch.p.rapidapi.com`, headers `x-rapidapi-key` + `x-rapidapi-host`) and will not authenticate against the direct API. Currently patched locally to the RapidAPI host/headers (check `git diff`/git history to see if this has since landed as a real commit).

5. **JSearch is genuinely unreliable, not just slow.** Project's own regression suite: "no source over 8s" passed 1/3 runs. Own testing tonight: 3/3 calls returned `503`, with full quota untouched (`x-ratelimit-requests-remaining` unchanged) — confirms it's an upstream outage, not an auth/quota problem. The cascade in `run_search()` already treats it as best-effort (falls through to Adzuna if <5 results); don't "fix" JSearch's flakiness by removing that fallback logic.

6. **Adzuna needs *both* `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`** (`AdzunaSource.available` requires both) — with either missing it silently contributes nothing, no error surfaced. Free, instant signup at developer.adzuna.com (no plan-tier step, unlike RapidAPI).

7. **Never read, `cat`, or echo `.env` in full**, and never build a shell check that expands a variable's value (`${VAR:-no}` prints the real value if `VAR` *is* set — only `:+`/`grep -c` patterns are safe for presence-only checks). This project's user handles their own secrets in `.env` directly; respect that boundary in any command you run.

## Git / PR workflow for this fork

One `changes-required.md` item = one branch = one PR = one squash-merged commit on `main`. `origin` = the user's fork (`prajjwalv19/observable-job-agent`); `upstream` = `jamwithai/observable-job-agent` (reference only, not pushed to).

`changes-required.md` itself lives **one directory above this repo** (`/mnt/d/Coding/llmProjects/job-hunt/changes-required.md`), not inside it.

**Primary mechanism**: run the `/ship-next-change` skill (`.claude/skills/ship-next-change/SKILL.md`) — finds the next non-struck-through item, runs it through `job-scout-planner` → `job-scout-implementer` → `job-scout-reviewer` (all in `.claude/agents/`), and on approval marks the item done in `changes-required.md` (strikethrough + PR link/artifact path). **One item per invocation, run it again for the next one.** This exists specifically instead of batch-processing every open item at once, after concurrent items (two both touching the JSearch query/param UI) risked colliding with each other mid-flight.

A batch alternative (`.claude/workflows/ship-changes.js`, run via the `Workflow` tool) also exists and processes every open item concurrently in one call — faster, but carries that same collision risk for related items and does **not** update `changes-required.md` itself (the workflow script has no filesystem access; that step would need to happen manually afterward, same as the skill's step 5). Prefer `/ship-next-change` unless there's a specific reason to batch.
