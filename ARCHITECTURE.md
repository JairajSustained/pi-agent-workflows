# ARCHITECTURE — pi-workflows

How the extension works, why it is shaped this way, and the invariants
contributors must preserve. Read this before touching `src/runtime/`.

## 1. Big picture

```
User prompt ("ultracode: …" / /workflow …)
  │ before_agent_start hook injects workflow guidance when triggered
  ▼
LLM writes a JS script + calls the `workflow` tool { script, args?, size?, resumeFrom? }
  │
  ▼
runWorkflow() — node:vm sandbox, minimal globals (agent/parallel/pipeline/phase/log/args)
  │  script variables hold intermediates; parent context sees NOTHING until return
  ├─ agent() ──► Scheduler (≤16 concurrent, ≤1000 total) ──► pi subprocess (clean context)
  ├─ results recorded to .pi/workflows/runs/<id>/results.jsonl (label-keyed)
  ▼
tool returns { final answer + usage + runId } — the ONLY thing entering parent context
```

Core idea (borrowed from Claude): **the plan lives in code, not in context.**
Deterministic control flow (loops, branches, retries, dedupe) runs as plain JS
at zero token cost; the model is spent only inside agents.

## 2. Module map

| File | Owns | Must stay free of |
|---|---|---|
| `src/index.ts` | Extension entry: `workflow` tool, `/workflow`, `/workflows`, trigger hook, saved-workflow commands | Heavy logic (delegate to runtime/) |
| `src/runtime/sandbox.ts` | vm execution, primitives, usage accounting, `onAgentResult` hook | Any fs/network/process access |
| `src/runtime/agent-runner.ts` | `pi` subprocess spawn, JSONL parsing, worktree, abort, fork-bomb guards | Knowledge of workflow semantics |
| `src/runtime/scheduler.ts` | Concurrency semaphore + total-agent cap | I/O |
| `src/runtime/validate.ts` | `meta` shape + banned-API lint (fail fast, LLM-actionable errors) | Execution |
| `src/runtime/store.ts` | Run dirs, result cache, save/reuse library | pi imports (must stay `node --test`-runnable) |
| `src/runtime/config.ts` | Trigger detection + env settings | pi imports (same reason) |
| `src/runtime/types.ts` | Shared types only | Runtime code |

Rule: `store.ts`, `config.ts`, `types.ts`, `validate.ts`, `scheduler.ts`,
`sandbox.ts` import **only node builtins + each other**. Only `index.ts` and
`agent-runner.ts` touch the outside world (pi API / child processes). This is
what lets `npm test` run fully offline.

## 3. The realm boundary (read this — it bites)

Scripts execute in a `node:vm` context, so **every object crossing back is
from another realm**: different `Array`/`Object` prototypes. Consequences:

- `assert.deepStrictEqual(vmValue, localLiteral)` FAILS. Tests compare via
  `JSON.stringify`. The tool result path already normalizes the same way
  (string results pass through; objects are `JSON.stringify`d).
- `instanceof Array` is false for script arrays. Prefer `Array.isArray`.
- `meta` is captured by rewriting its declaration to also assign
  `globalThis.__pi_meta` (see `sandbox.ts`); the script is wrapped in an async
  IIFE so top-level `await`/`return` keep working.

## 4. Concurrency model

- `Scheduler` is a counting semaphore + spawn counter. `parallel()` fans out
  through `Promise.all`; each `agent()` call passes through
  `schedule(label, fn)`, which throws past the cap (fail fast, names the agent).
- `pipeline(items, stages…)` runs items concurrently; each item runs its stages
  sequentially. Total time ≈ slowest item chain, not the sum.
- Default concurrency `min(16, max(2, cpus-2))`, total cap 1000
  (overridable via `PI_WORKFLOWS_MAX_CONCURRENCY` / `PI_WORKFLOWS_MAX_AGENTS`).

## 5. Persistence schema

```
.pi/workflows/runs/<runId>/
  script.js       # exact script executed
  args.json       # tool args
  results.jsonl   # one { label, at, result } per FRESH agent (never cache replays)
  status.json     # { runId, name, status: running|complete|failed, startedAt, finishedAt?, agentsSpawned?, resumedFrom?, error? }
  summary.json    # { result } on success
.pi/workflows/<name>.js          # saved reusable workflows (project; committed)
~/.pi/agent/workflows/<name>.js  # saved reusable workflows (personal)
```

Resume = new run + `withResultCache`: labels present in the old `results.jsonl`
replay without spawning (marked `cached: true`, excluded from usage totals).
Deterministic labels are therefore a correctness requirement, enforced socially
(tool description + docs) rather than mechanically.

## 6. Safety invariants (do not weaken without discussion)

1. **No self-execution.** `getPiInvocation()` self-spawns only from pi's real
   entrypoint (`isPiEntryPoint`: `pi`/`pi.exe`, or `cli.js|ts` under a
   `pi-coding-agent` path). Anything else falls back to `pi` on `PATH`.
   Violating this fork-bombs (2026-09-17 incident: ~1000 procs, 37 GB RAM).
2. **Depth ceiling.** `PI_WORKFLOWS_DEPTH` increments per spawned generation;
   the runner refuses past 3. Converts any future re-entry path into an error.
3. **Sandbox deny-list.** No fs/network/process/timers in scripts; enforced by
   static lint (`validate.ts`) AND minimal vm globals (defense in depth).
   `Date.now`/`Math.random` are banned for determinism.
4. **No silent persistence failure modes.** Run recording is best-effort and
   can never fail a workflow; spawn/validation failures always fail loudly.
5. **Abort + cleanup propagate.** Abort kills the child (TERM→KILL) and throws;
   worktrees are removed in all paths (`remove --force`, fallback rm + prune).
6. **Run-id/name sanitization.** `sanitizeRunId` / `sanitizeWorkflowName`
   block path traversal into the runs/saved-workflow dirs.

## 7. Extension surface (pi API usage)

- `pi.registerTool({ name: "workflow", … })` with `promptSnippet` +
  `promptGuidelines` so the model discovers it; `execute()` streams progress
  via `onUpdate` and inherits `ctx.model` (provider+id) for children.
- `pi.on("before_agent_start")` appends trigger guidance only when
  `requestsWorkflow(prompt)` matches (`ultracode` keyword or equivalent).
- `pi.on("session_start")` registers `/workflow-<name>` per saved workflow
  (project + user dirs).
- `/workflows` subcommands: list (default), `show <id>`, `resume <id>`
  (via `sendUserMessage` follow-up), `save <id> <name>`.
- Respects `PI_WORKFLOWS_DISABLE=1`.

## 8. Testing strategy

- `npm test` — fully offline (stub `AgentFn`s, temp dirs/git repos). Must stay
  that way: no network, no model, no `pi` spawns.
- `tests/live.test.ts` — gated behind `PI_WORKFLOWS_LIVE=1` + explicit model;
  re-run the single `round-trips` case (kill-switch armed, trip at >6 test
  procs) **after any change to `agent-runner.ts`**. Unit tests cannot catch
  scope/runtime errors in the spawn path — live can.
- Stripped-TS constraint: sources must parse under node's type-stripping
  (no enums, namespaces, or parameter properties) AND under pi's jiti loader.

## 9. Deliberate v1 limits

Foreground execution only (abort + resume instead of background runs) ·
command-based manager (no custom TUI) · no nested-workflow spawning · no
cross-session resume · project trust inherited from pi (no extra prompting
for saved-workflow scripts — they are version-controlled code, review them).
