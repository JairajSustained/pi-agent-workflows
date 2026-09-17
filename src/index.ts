/**
 * pi-workflows — dynamic workflows for pi (Claude parity as a pure extension).
 *
 * The LLM writes a JS orchestration script; the `workflow` tool executes it in
 * an isolated sandbox, fanning out to isolated `pi` subprocess agents.
 * Only the script's return value reaches the parent context.
 */

import * as cpus from "node:os";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { createAgentRunner } from "./runtime/agent-runner.ts";
import { runWorkflow } from "./runtime/sandbox.ts";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as path from "node:path";
import { defaultSize, isWorkflowsDisabled, requestsWorkflow, resolveConcurrency, resolveMaxAgents } from "./runtime/config.ts";
import {
  createRun,
  finishRun,
  listRuns,
  listSavedWorkflows,
  loadCachedResults,
  readRunSummary,
  runsRoot,
  recordAgentResult,
  sanitizeRunId,
  sanitizeWorkflowName,
  saveWorkflowRun,
  withResultCache,
} from "./runtime/store.ts";
import { SIZE_TARGETS, type SizeGuideline } from "./runtime/types.ts";

const SizeSchema = StringEnum(["small", "medium", "large", "unrestricted"] as const, {
  description:
    'How many agents the workflow should aim for. Advice, not a cap. small: <5, medium: <15, large: <50. Default: "medium".',
  default: "medium",
});

const WorkflowParams = Type.Object({
  script: Type.String({
    description:
      "Complete JS orchestration script. Must declare `const meta = { name, description, phases? }` and use agent()/parallel()/pipeline()/phase()/log(). Plain JS + top-level await. No fs/network/process/timers — only spawned agents can act.",
  }),
  args: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Input object available to the script as the `args` global.",
    }),
  ),
  size: Type.Optional(SizeSchema),
  resumeFrom: Type.Optional(
    Type.String({
      description:
        "Run id (from /workflows) to resume. Agents with labels completed in that run replay from cache instead of re-spawning. Only works when the script labels agents deterministically.",
    }),
  ),
});

function currentConcurrency(): number {
  return resolveConcurrency(cpus.cpus().length);
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    if (isWorkflowsDisabled()) return;
    if (!requestsWorkflow(event.prompt)) return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\nThe user requested a dynamic workflow for this task (keyword `ultracode` or equivalent). " +
        "Write a JS orchestration script and run it with the workflow tool instead of working turn by turn. " +
        "Break the task into parallelizable subtasks with deterministic agent labels, add a verification pass where correctness matters, " +
        "and return only the final synthesized answer. If the task is trivially small, say so and proceed directly instead.",
    };
  });

  const registerSavedWorkflowCommands = async (cwd: string): Promise<void> => {
    const userDir = path.join(getAgentDir(), "workflows");
    const saved = await listSavedWorkflows(cwd, userDir);
    for (const w of saved) {
      const commandName = `workflow-${w.name}`;
      pi.registerCommand(commandName, {
        description: `Run saved ${w.scope} workflow "${w.name}"`,
        handler: async (cmdArgs, cmdCtx) => {
          pi.sendUserMessage(
            `Run the saved workflow "${w.name}" (${w.scope}, script file: ${w.file}). ` +
              `Read the script file, then call the workflow tool with that exact script text. ` +
              `Derive the script's \`args\` object from this request text ({} if none applies): ${cmdArgs || "(no extra input)"}`,
            { deliverAs: "followUp" },
          );
          cmdCtx.ui.notify(`Running saved workflow "${w.name}"…`, "info");
        },
      });
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    try {
      await registerSavedWorkflowCommands(ctx.cwd);
    } catch {
      /* saved workflows are optional */
    }
  });

  pi.registerTool({
    name: "workflow",
    label: "Workflow",
    description: [
      "Run a dynamic workflow: a JS script you write that orchestrates many isolated subagents.",
      "Use when a task outgrows one context window, needs the same step across many items, or needs enforced verification (fan-out + adversarial review, tournament, pipeline).",
      "The script holds the loop/branching/results in variables; only its return value comes back here.",
      "Always declare meta { name, description, phases? }. Spawn agents with agent(prompt, { label, phase, schema, model }).",
      "Batch with parallel([...fns]) (barrier) or pipeline(items, stage1, stage2...). Mark progress with phase(title) and log(msg).",
      "Read inputs from the `args` global. Keep each agent prompt self-contained with its own goal, scope, and output format.",
      "Label every agent deterministically (e.g. per-item or per-stage labels) so a failed run can resume with resumeFrom without redoing completed agents. Runs are recorded under .pi/workflows/runs/<runId>/.",
    ].join(" "),
    promptSnippet: "workflow(script, args?, size?, resumeFrom?): orchestrate isolated subagents from a JS script",
    promptGuidelines: [
      "Use workflow when a task needs more agents than one turn can coordinate, needs enforced verification, or the orchestration is worth reusing.",
    ],
    parameters: WorkflowParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const size = (params.size ?? defaultSize()) as SizeGuideline;
      const baseRunner = createAgentRunner({
        cwd: ctx.cwd,
        provider: ctx.model?.provider,
        model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
      });
      const phases: string[] = [];
      const emit = (text: string): void => {
        onUpdate?.({
          content: [{ type: "text", text }],
          details: { phases, preview: text },
        });
      };

      // Persistence is best-effort: a run record must never break the workflow.
      const argsObject = (params.args ?? {}) as Record<string, unknown>;
      let runDir: string | null = null;
      let runId: string | null = null;
      try {
        const resumeId = params.resumeFrom != null ? sanitizeRunId(params.resumeFrom) : undefined;
        const created = await createRun(ctx.cwd, params.script, argsObject, resumeId);
        runId = created.runId;
        runDir = created.dir;
      } catch {
        runDir = null;
      }
      let runner = baseRunner;
      if (params.resumeFrom != null && runDir != null) {
        try {
          const prevDir = `${runsRoot(ctx.cwd)}/${sanitizeRunId(params.resumeFrom)}`;
          runner = withResultCache(baseRunner, await loadCachedResults(prevDir));
        } catch (err) {
          throw new Error(
            `cannot resume from "${params.resumeFrom}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      let outcome;
      try {
        outcome = await runWorkflow(
          params.script,
          argsObject,
          runner,
          {
            maxConcurrency: currentConcurrency(),
            maxAgents: resolveMaxAgents(),
            size,
            defaultCwd: ctx.cwd,
          },
          {
            signal,
            onLog: (msg) => emit(msg),
            onPhase: (title) => {
              phases.push(title);
              emit(`Phase: ${title}`);
            },
            onAgentResult: runDir != null ? (label, result) => recordAgentResult(runDir as string, label, result) : undefined,
          },
        );
      } catch (err) {
        if (runDir != null) {
          try {
            await finishRun(runDir, {
              status: "failed",
              name: "failed",
              agentsSpawned: 0,
              error: err instanceof Error ? err.message : String(err),
            });
          } catch {
            /* persistence is best-effort */
          }
        }
        throw err;
      }
      if (runDir != null) {
        try {
          await finishRun(runDir, {
            status: "complete",
            name: outcome.meta.name,
            agentsSpawned: outcome.agentsSpawned,
            result: outcome.result,
          });
        } catch {
          /* persistence is best-effort */
        }
      }

      const target = SIZE_TARGETS[size];
      const sizeNote =
        target != null && outcome.agentsSpawned > target
          ? `\n\nNote: spawned ${outcome.agentsSpawned} agents vs "${size}" guideline (~${target}). Prefer smaller slices or narrower scope next time.`
          : "";
      const largeNote =
        outcome.agentsSpawned > 25
          ? `\n\nLarge workflow: ${outcome.agentsSpawned} agents ran. Review token usage before scaling further.`
          : "";

      const resultText =
        typeof outcome.result === "string" ? outcome.result : JSON.stringify(outcome.result, null, 2);
      const u = outcome.usage;
      const usageLine =
        `Usage: ${u.agents} agent(s), ${u.turns} turn(s), ` +
        `↑${u.input} ↓${u.output} (cache R${u.cacheRead} W${u.cacheWrite}) $${u.cost.toFixed(4)}`;

      const runNote = runId != null ? `\nRun id: ${runId} (inspect with /workflows show ${runId})` : "";
      return {
        content: [
          {
            type: "text",
            text: `Workflow "${outcome.meta.name}" complete: ${outcome.agentsSpawned} agent(s) across ${outcome.phasesSeen.length} phase(s).\n${usageLine}${runNote}\n\n${resultText}${sizeNote}${largeNote}`,
          },
        ],
        details: {
          meta: outcome.meta,
          runId,
          agentsSpawned: outcome.agentsSpawned,
          phasesSeen: outcome.phasesSeen,
          logs: outcome.logs,
          usage: outcome.usage,
          result: outcome.result,
        },
      };
    },
  });

  pi.registerCommand("workflow", {
    description: "Draft and run a dynamic workflow for a task (fan-out across isolated subagents)",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /workflow <task>. Describe the task; I will write and run a workflow script.", "info");
        return;
      }
      pi.sendUserMessage(
        `Write and run a dynamic workflow for the following task using the workflow tool. ` +
          `Break it into parallelizable subtasks with verification where it matters. Task: ${task}`,
        { deliverAs: "followUp" },
      );
    },
  });

  pi.registerCommand("workflows", {
    description: "Manage workflow runs: /workflows [show <id> | resume <id>]",
    handler: async (args, ctx) => {
      const [sub, id] = args.trim().split(/\s+/, 2);
      if (sub === "show" && id) {
        try {
          const summary = await readRunSummary(ctx.cwd, id);
          const resultPreview =
            summary.result === undefined
              ? "(no result recorded)"
              : JSON.stringify(summary.result).slice(0, 2000);
          ctx.ui.notify(
            [`Run ${summary.runId}`, `  name: ${summary.name} (${summary.status})`, `  started: ${summary.startedAt}`, `  agents: ${summary.agentsSpawned ?? "?"}`, summary.error ? `  error: ${summary.error}` : "", `  result: ${resultPreview}`]
              .filter(Boolean)
              .join("\n"),
            "info",
          );
        } catch (err) {
          ctx.ui.notify(`Cannot show run: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
        return;
      }
      if (sub === "save" && id) {
        const [runId, name] = [id, args.trim().split(/\s+/).slice(2).join(" ")];
        if (!name) {
          ctx.ui.notify("Usage: /workflows save <runId> <name>", "error");
          return;
        }
        try {
          const file = await saveWorkflowRun(ctx.cwd, runId, sanitizeWorkflowName(name));
          ctx.ui.notify(`Saved workflow "${name}" → ${file}\nRun it with /workflow-${name}`, "info");
        } catch (err) {
          ctx.ui.notify(`Cannot save workflow: ${err instanceof Error ? err.message : String(err)}`, "error");
        }
        return;
      }
      if (sub === "resume" && id) {
        try {
          sanitizeRunId(id);
        } catch (err) {
          ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
          return;
        }
        pi.sendUserMessage(
          `Resume workflow run "${id}" using the workflow tool with resumeFrom: "${id}". ` +
            `Reuse the same script shape with deterministic agent labels so completed agents replay from cache; only execute what is missing.`,
          { deliverAs: "followUp" },
        );
        return;
      }
      const runs = await listRuns(ctx.cwd);
      if (runs.length === 0) {
        ctx.ui.notify("No workflow runs yet in this project. Use /workflow <task> to start one.", "info");
        return;
      }
      ctx.ui.notify(
        [`Workflow runs:`, ...runs.map((r) => `- ${r.runId}  ${r.name} (${r.status}, ${r.agentsSpawned ?? "?"} agents)`)]
          .join("\n")
          .concat("\n/workflows show <id> for detail, /workflows resume <id> to continue, /workflows save <id> <name> to reuse."),
        "info",
      );
    },
  });
}
