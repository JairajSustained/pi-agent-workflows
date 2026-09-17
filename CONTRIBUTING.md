# CONTRIBUTING — pi-workflows

## Setup

No build step. Requirements: Node ≥ 22, `pi` on `PATH` (for live tests only).

```bash
cd pi-agent-workflows
npm test            # offline suite — must pass before every commit
```

Load the extension in pi while developing:

```bash
pi -e ./src/index.ts
```

## Ground rules

1. **Read `ARCHITECTURE.md` first**, especially §3 (realm boundary) and
   §6 (safety invariants).
2. **Write strip-safe TypeScript.** Sources run under node's type-stripping
   and pi's jiti loader — no enums, namespaces, or parameter properties.
   `import type` and explicit `.ts` import extensions are required.
3. **Keep the offline/testable boundary.** `store.ts`, `config.ts`,
   `types.ts`, `validate.ts`, `scheduler.ts`, `sandbox.ts` must import only
   node builtins + each other, so `npm test` never needs network, models,
   or `pi` spawns.
4. **Every runtime behavior gets a test.** Primitives and edge cases with
   stub `AgentFn`s; cross-realm values compared via `JSON.stringify`.
5. **Never weaken a safety invariant silently.** Changes to `isPiEntryPoint`,
   the depth guard, the banned-API list, or worktree cleanup need explicit
   review and a regression test.

## Live tests (spend real money — follow the procedure)

```bash
PI_WORKFLOWS_LIVE=1 PI_WORKFLOWS_MODEL="opencode-go/muse-spark-1.3-contributor" \
  node --test --test-name-pattern="round-trips" tests/live.test.ts
```

- One case at a time. Watch `pgrep -f 'pi-agent-workflows/tests/live.test.ts'`
  in a second terminal; keep a `pkill -9` loop ready (kill-switch trips at >6).
- **Mandatory after any change to `src/runtime/agent-runner.ts`** — unit
  tests cannot execute the spawn path.
- Full procedure and history in `tests/live.test.ts` header.

## Secrets

- Never commit `.env` files, API keys, tokens, or provider credentials.
  `.gitignore` already excludes `*.env` and run records.
- Before pushing, run: `git status --short` and
  `grep -rniE 'api[_-]?key\s*[:=]|secret\s*[:=]' --include='*.ts' src/ tests/`.
- Live model credentials come from your environment/pi auth at runtime —
  nothing credential-like belongs in this repo.

## Commits & releases

- Small, scoped commits; conventional-ish messages (`area: what changed`).
- Update `README.md` for user-facing changes, `ARCHITECTURE.md` for
  structural/safety changes, `PLAN.md` stays as the v1 historical record —
  don't rewrite it, append a dated note if plans change.
