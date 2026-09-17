# Dynamic Workflows for Pi — Research + Build Plan
**Status:** DRAFT for review — no code written yet
**Date:** 2026-09-17
**Target:** pi coding agent extension (`@earendil-works/pi-coding-agent` v0.85.1), working dir `pi-agent-workflows/`

---

## 1. What Claude's Dynamic Workflows are (research summary)

Sources: `code.claude.com/docs/en/workflows.md`, `claude.com/blog/introducing-dynamic-workflows-in-claude-code` (2026-05-28), `claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code` (2026-06-02), Agent SDK cookbook `claude-agent-sdk-08-dynamic-workflows`, community guides (AgentUpdate.ai, InfoQ, TheNewStack).

**One-liner:** Claude writes a small JavaScript orchestration script at runtime; a `Workflow` runtime executes it in the background, fanning out to tens–hundreds of clean-context subagents.

**Core shift — "who holds the plan":**

| | Subagents | Skills | Agent teams | Workflows |
|---|---|---|---|---|
| What | Worker Claude spawns | Instructions Claude follows | Lead supervising peers | Script the runtime executes |
| Who decides next | Claude turn-by-turn | Claude, following prompt | Lead agent turn-by-turn | The script |
| Intermediate results | Claude's context | Claude's context | Shared task list | Script variables |
| Repeatable | Worker def | Instructions | Team def | The orchestration itself |
| Scale | A few/turn | Same | Handful of peers | Dozens–hundreds/run |
| Interrupt | Restarts turn | Restarts turn | Teammates keep running | Resumable same session |

Moving loop/branching/results into code means: (a) parent context only sees the final answer, (b) verification is enforced by control flow, not by hoping Claude remembers, (c) the script is a readable, editable, re-runnable artifact.

**Script shape (plain JS, top-level `await`, isolated env):**

```js
export const meta = { name: 'fact-check', description: '...', phases: [{title:'Extract'},{title:'Verify'},{title:'Report'}] };
// primitives:
agent(prompt, { label, phase, schema, model, worktree? })
parallel([() => agent('...'), () => agent('...')])   // barrier
pipeline(items, stage1, stage2, ...)                  // per-item stages, items flow independently
phase('Verify'); log('...'); args /* global input */; return {...}
```

Standard JS (`JSON/Math/Array`) allowed. **No** FS/shell/user-input from the script itself — only spawned agents can read/write/run. Standard patterns composed from primitives: classifier/router, fan-out-and-synthesize, adversarial verification (skeptic re-checks every verdict), generate-and-filter, tournament (N attempts → pairwise judge), loop-until-done.

**Triggers:** natural language ("use a workflow") or keyword `ultracode` (pre-v2.1.160: `workflow`); `/effort ultracode` = xhigh reasoning + auto-workflow for every substantive task; saved scripts in `.claude/workflows/` become `/commands` (accept `args`); bundled `/deep-research` is the reference example.

**Runtime limits:** ≤16 concurrent agents (fewer on low-core), ≤1000 agents/run, resumable in-session (completed agents cached), background execution with `/workflows` manager (drill into phase → agent prompt/tool calls/result; `p` pause/resume, `x` stop, `r` restart agent, `s` save as command). `Large workflow` warning at >25 agents or ~1.5M projected tokens.

**Permissions/cost:** subagents run `acceptEdits`, inherit allowlist; shell/web/MCP outside allowlist pauses the run → pre-approve allowlist for long runs. Token cost is "meaningfully more" than a chat session — mitigate via size guideline (`small <5` / `medium <15` / `large <50` / `unrestricted`), cheaper models for mechanical stages, test on a small slice first.

**When to use:** task bigger than one context, parallelizable across items, worth verifying twice (codebase sweeps, 500-file migrations, cross-checked research, multi-angle plans). Skip for simple Q&A or fixed-instruction repetition (use subagent/skill).

---

## 2. What Pi has today (gap analysis)

- **Extensions** (`docs/extensions.md`): TS modules, `pi.registerTool()` (LLM-callable), `pi.registerCommand()` (`/foo`), events (`input`, `before_agent_start`, `tool_call`, `tool_result`, `turn_*`, `agent_*`, `session_*`, `context`), `ctx.ui` (select/confirm/notify/status/widget/custom TUI), `pi.sendUserMessage` / `sendMessage`, `pi.appendEntry` persistence, `setActiveTools`, entry renderers. Loaded via jiti, no compile step. Distributable via `packages.md` (npm/git).
- **Subagent example** (`examples/extensions/subagent/`): `subagent` tool spawning a **separate `pi` process** per agent (isolated context, JSON-mode output capture). Modes: single `{agent, task}`, parallel `{tasks:[...]}` (max 8, 4 concurrent), chain `{chain:[...]}` with `{previous}` placeholder. Agents = MD files with frontmatter (`name/description/tools/model` + system prompt) from `~/.pi/agent/agents` (+ optional project scope). Rich TUI (collapsed/expanded, streaming, usage stats), 50KB/task output cap, abort propagation.
- **Gaps vs Claude:** (1) no JS workflow runtime — the LLM orchestrates turn-by-turn, so every intermediate result lands in parent context (context ceiling at a handful of agents); (2) no script artifact — orchestration isn't saved/reused/diffed; (3) no enforced quality patterns (adversarial/tournament/pipeline are prompt wishes, not control flow); (4) no resumability, no run manager UI, no size guideline, no `args`-parametrized saved workflows.

Good news: Pi's extension API already exposes every hook needed to close these gaps without forking Pi core.

---

## 3. Proposed build: `pi-workflows` extension

**Goal:** Claude-parity dynamic workflows as a pure Pi extension (+ optional bundled skill): LLM writes JS, `workflow` tool runs it, parent sees only the final answer.

### 3.1 Architecture

```
User prompt ("...use a workflow..." / /workflow ...)
  → input / before_agent_start hook injects workflow guidance (trigger detection)
  → LLM calls workflow tool with { meta, script, args }
  → WorkflowRuntime (in extension):
      - validates meta + script (syntax, banned APIs)
      - executes script in isolated VM (node:vm, no fs/process/require) with injected globals:
        agent(), parallel(), pipeline(), phase(), log(), args, budget, structured-output schema support
      - agent() spawns isolated `pi -p` subprocess (reuse subagent-example pattern):
        clean context, per-stage prompt, tools allowlist, model override, optional worktree (git worktree per lane), JSON output capture, 50KB cap
      - scheduler: concurrency semaphore min(16, cpu-2), total cap 1000, queueing, per-agent timeout
      - state store: run dir `.pi/workflows/runs/<runId>/{script.js, args.json, results.jsonl, status.json}` + session entries via appendEntry → resumable same-session
      - streams progress via onUpdate + ctx.ui.setStatus/setWidget; TUI renderers for tool call/result
  → returns final script `return` value as tool result (only this enters parent context)
  → /workflows command: list/inspect/pause/resume/stop/restart-agent/save-as-command
  → saved workflows → `.pi/workflows/*.js` (+ global `~/.pi/agent/workflows/`), invokable as `/workflow:<name>` with args
```

**Why subprocess per agent (not in-process LLM call):** matches Pi's proven subagent isolation, gives clean context windows, inherits Pi's own permission/sandbox/tool policy, survives parent compaction, allows model + worktree routing per stage.

**Why `node:vm` for the script:** Claude parity (same mental model, portable scripts), deterministic control flow at zero token cost, easy static checks (ban `fetch/process/require/fs`, ban `Date.now/Math.random` for determinism like Claude).

### 3.2 Tool + command surface (proposed)

- `workflow` tool: `{ meta: {name, description, phases?}, script: string, args?: object, size?: small|medium|large, modelDefaults? }` → `{ summary, phases, agentCount, usage, result }`. With `promptSnippet` + `promptGuidelines` so the LLM knows when/how to use it.
- `/workflow <task>` command: asks the LLM to draft + run a workflow for the task (sets up the trigger without the user memorizing keywords).
- `/workflows` command: run manager (list, inspect agent prompts/results/usage, pause/resume/stop/restart, save). v1 can be text-based; TUI custom component in v2.
- `/workflow-save <runId> <name>` (or `s` inside manager): persist script to `.pi/workflows/<name>.js` with `args` defaults; saved workflows surface as `/workflow:<name>` prompt-template-style commands.
- Settings: `workflowSizeGuideline` (small/medium/large/unrestricted, default medium), `workflowConcurrency`, `workflowAllowProjectAgents`, `workflowWorktree` default, disable flag. Trigger keyword configurable (default `ultracode`, plus natural-language detection).
- Bundled skill `deep-research-pi` (port of Claude's `/deep-research`): fan-out searches → fetch → adversarial verify → cited report. Proves the pattern library.

### 3.3 Pattern library (prompt guidance, not code)

Ship as system-prompt guidelines + docs + `/workflow` examples: fan-out-and-synthesize, adversarial verification, generate-and-filter, tournament, loop-until-done, classifier/router, pipeline-per-item. Each with a starter script template.

### 3.4 Non-goals for v1

Full TUI interactive manager (v1 = command output + status widget), cross-session resume (same-session only, like Claude), nested-workflow spawning (ban `workflow` tool inside agents to avoid recursion), web dashboard / RPC-first UI.

---

## 4. Phased plan

- **Phase 0 — Scaffold + spike (0.5d):** extension skeleton `pi-agent-workflows/{package.json, src/index.ts, src/runtime/*, workflows/, skills/, tests/}`; verify `registerTool` + `vm` sandbox + `spawn pi -p` round-trip in this repo; decide subprocess argv + JSON capture format.
- **Phase 1 — Runtime MVP (2–3d):** `agent()` + `parallel()` + `phase()/log()/args` + meta validation + concurrency limiter + total cap + timeouts + per-agent usage accounting + output caps. Tool returns final answer only. Unit tests with stubbed agent fn; integration test with 3-agent fan-out.
- **Phase 2 — Composition + safety (2d):** `pipeline()`, `schema` structured output (JSON parse + retry), model override per agent, worktree isolation option, banned-API lint, size guideline enforcement, allowlist pre-check warning, abort propagation (Ctrl+C kills run + children).
- **Phase 3 — Persistence + resume (1–2d):** run dir + JSONL results + `appendEntry` checkpoints; resume same-session (cached completed agents); `/workflows` list/inspect/pause/resume/stop/restart-agent.
- **Phase 4 — Triggers + save/reuse (1–2d):** keyword + NL trigger via `input`/`before_agent_start`, `/workflow` command, save to `.pi/workflows/` + `/workflow:<name>` with `args`, settings keys + disable flag, `deep-research-pi` skill + 2–3 starter templates (audit, migration, fact-check).
- **Phase 5 — Polish + docs (1d):** TUI renderers (collapsed/expanded like subagent example), status widget, README + SKILL.md + examples, `pi install`-ready packaging (`packages.md`), demo scripts + cost guidance.

**Total ≈ 7–10 working days** for Claude-parity v1.

### Test strategy
Unit (scheduler, caps, vm sandbox bans, pipeline semantics, resume replay) + integration (real `pi -p` fan-out of 3–5 stub agents on a fixture repo) + adversarial E2E (fact-check fixture asserting skeptic overturns a planted false "confirmed") + manual checklist (pause/resume/stop/save, large-workflow warning, untrusted project-agents prompt).

---

## 5. Key decisions for you (review)

1. **Scope:** full parity v1 as above, or slimmer MVP (Phase 1+2 only, no manager/save)?
2. **Distribution:** local `.pi/extensions/` in this repo vs publishable npm package (`pi install`)?
3. **Trigger:** keyword (`ultracode`?) + auto, or explicit `/workflow` only for v1?
4. **agent() backend:** subprocess `pi -p` (recommended, isolated) vs in-process model call (faster, but shares context/policy)?
5. **Manager UI:** text `/workflows` output ok for v1, or do you want the full TUI browser from day one?
6. **Reference skill:** include `deep-research-pi` port in v1?

Reply with what to change, or approve and I'll start at Phase 0.
