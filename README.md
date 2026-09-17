# pi-workflows — dynamic workflows for pi

Claude-parity dynamic workflows as a pure pi extension (no pi fork required).
The model writes a JS orchestration script at runtime; the `workflow` tool
executes it across isolated `pi` subprocess agents. Only the script's return
value reaches the parent context — the plan lives in code, not in context.

## Install

Try it without installing:

```bash
pi -e /path/to/pi-agent-workflows/src/index.ts
```

Install as a pi package (project-local with `-l`):

```bash
pi install /path/to/pi-agent-workflows
```

This registers the `workflow` tool, the `/workflow` + `/workflows` commands,
and the `deep-research-pi` skill.

## Usage

**Trigger with a keyword** (like Claude's `ultracode`) or plain language:

```
ultracode: audit the auth module for injection flaws
use a workflow to check every route handler against the API spec
```

**Or explicitly:**

```
/workflow migrate all fetch() calls to the HttpClient wrapper
```

**What the model does:** writes a script declaring
`const meta = { name, description, phases? }` and calls it via the `workflow`
tool with `{ script, args?, size?, resumeFrom? }`.

### Script primitives

| Primitive | Meaning |
|---|---|
| `agent(prompt, { label, phase, schema, model, systemPrompt, worktree })` | Spawn one isolated agent (clean context). `schema: "json"` enforces JSON output. `worktree: true` runs it in its own `git worktree`. |
| `parallel([() => agent(...), ...])` | Barrier: run a batch concurrently, wait for all. |
| `pipeline(items, stage1, stage2, ...)` | Each item flows through every stage; items run concurrently. |
| `phase(title)` / `log(msg)` | Progress markers streamed to the UI. |
| `args` | Input object passed via the tool's `args` param. |
| `return {...}` | The only thing that comes back to the parent context. |

Plain JS (`JSON/Math/Array/...`) between calls is free — filtering, merging,
loops, and retries cost zero tokens. No filesystem, network, processes, or
timers in the script itself; only spawned agents can act. Banned constructs
(`require`, `process`, `fetch`, `eval`, `Date.now`, `Math.random`, …) fail
fast with an actionable error.

### Composable patterns

Fan-out-and-synthesize · adversarial verification (a skeptic re-checks every
verdict) · generate-and-filter · tournament · loop-until-done ·
classifier/router · pipeline-per-item. See `skills/deep-research-pi/SKILL.md`
and `examples/workflows/` (`audit.js`, `fact-check.js`).

### Managing runs

```
/workflows                 # list runs (status, agents)
/workflows show <id>       # inspect result, usage, errors
/workflows resume <id>     # re-run; deterministically-labelled agents replay from cache
/workflows save <id> <name># save script as reusable /workflow-<name>
```

Every run is recorded under `<project>/.pi/workflows/runs/<runId>/`
(`script.js`, `args.json`, `results.jsonl`, `status.json`, `summary.json`).
Saved workflows live in `.pi/workflows/*.js` (project) or
`~/.pi/agent/workflows/*.js` (personal) and auto-register as
`/workflow-<name>` commands each session.

**Label agents deterministically** (per-item / per-stage labels) — that is
what makes resume replay instead of re-spawn.

## Settings (env)

| Var | Default | Meaning |
|---|---|---|
| `PI_WORKFLOWS_SIZE` | `medium` | Size advice: `small` (<5 agents) · `medium` (<15) · `large` (<50) · `unrestricted` |
| `PI_WORKFLOWS_DISABLE` | unset | `=1` disables the trigger guidance |
| `PI_WORKFLOWS_MAX_CONCURRENCY` | `min(16, cpus-2)` | Concurrent agent cap (hard ceiling 16) |
| `PI_WORKFLOWS_MAX_AGENTS` | `1000` | Total agents per run (runaway backstop) |

## Cost + limits

A workflow spends meaningfully more tokens than a chat turn (each agent is a
full session). Mitigate: start on a small slice, use `small`, route mechanical
stages to cheaper models via per-agent `model`. Same-session resume replays
cached agents at zero cost. Foreground runs stop with Ctrl+C (abort propagates
to children); completed labels can resume afterwards.

## Safety notes

- `getPiInvocation()` only self-spawns from pi's real entrypoint (never from
  an arbitrary running script) and `PI_WORKFLOWS_DEPTH` (max 3) caps nesting —
  regression-tested after a 2026-09-17 incident where the test file
  re-executed itself exponentially. See `tests/agent-runner.test.ts`.
- `worktree: true` requires a git checkout and always cleans up
  (`worktree remove --force`, fallback rm + prune).
- Agent output is capped at 50KB per agent for parent context; full output is
  in the run dir.

## Layout

```
src/index.ts                 # extension entry: workflow tool, /workflow, /workflows, trigger hook
src/runtime/sandbox.ts       # isolated vm execution + primitives
src/runtime/agent-runner.ts  # pi subprocess backend, worktree, abort, fork-bomb guards
src/runtime/scheduler.ts     # concurrency + total caps
src/runtime/validate.ts      # meta + banned-API lint
src/runtime/store.ts         # run persistence, cache, save/reuse
src/runtime/config.ts        # triggers + env settings
skills/deep-research-pi/     # reference skill (port of Claude's /deep-research)
examples/workflows/          # starter scripts (audit, fact-check)
tests/                       # node --test suite (offline) + live.test.ts (opt-in)
```

## Tests

```bash
npm test   # offline: 25 checks, no model calls, no spawns
PI_WORKFLOWS_LIVE=1 PI_WORKFLOWS_MODEL="opencode-go/muse-spark-1.3-contributor" \
  node --test --test-name-pattern="round-trips" tests/live.test.ts
```

Live-run safety: run one case at a time, watch
`pgrep -f 'pi-agent-workflows/tests/live.test.ts'`, keep a `pkill -9` loop
ready (kill-switch trips at >6). Details in `tests/live.test.ts`.

## Differences from Claude's implementation

- Agents are `pi -p` subprocesses (isolated, inherit allowlist) rather than
  in-process subagents; per-agent `model` and `worktree` routing included.
- Foreground execution in v1 (no detached background runs yet); pause/stop =
  abort + resume. The `/workflows` manager is command-based, not a full TUI.
- No nested-workflow spawning (depth guard refuses); no cross-session resume.
