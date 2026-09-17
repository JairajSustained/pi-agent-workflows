/**
 * Real AgentFn backend: spawn one isolated `pi` subprocess per agent.
 * Adapted from pi's bundled subagent example (JSON mode + JSONL parsing).
 *
 * Each agent starts with a clean context, sees only its prompt (+ optional
 * role system prompt), and works in the run's cwd with the given tools/model.
 */

import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { AgentFn, AgentOptions, AgentResult } from "./types.ts";

export interface RunnerDefaults {
  cwd: string;
  model?: string;
  provider?: string;
  tools?: string[];
  timeoutMs?: number;
}

export const PER_AGENT_OUTPUT_CAP = 50 * 1024;

function truncate(output: string): string {
  if (Buffer.byteLength(output, "utf8") <= PER_AGENT_OUTPUT_CAP) return output;
  let cut = output.slice(0, PER_AGENT_OUTPUT_CAP);
  while (Buffer.byteLength(cut, "utf8") > PER_AGENT_OUTPUT_CAP) cut = cut.slice(0, -1);
  return `${cut}\n\n[Output truncated to 50KB for parent context. Full output in run logs.]`;
}

/**
 * True only when `scriptPath` is pi's own entrypoint — never an arbitrary
 * script node happens to be running (e.g. a test file under `node --test`).
 * Without this check the self-spawn branch re-executes the current file,
 * which re-enters the runner and fork-bombs (see 2026-09-17 incident).
 */
export function isPiEntryPoint(scriptPath: string): boolean {
  const base = path.basename(scriptPath).toLowerCase();
  if (base === "pi" || base === "pi.exe") return true;
  if ((base === "cli.js" || base === "cli.ts") && scriptPath.includes("pi-coding-agent")) return true;
  return false;
}

export function getPiInvocation(extraArgs: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (
    currentScript &&
    isPiEntryPoint(currentScript) &&
    !currentScript.startsWith("/$bunfs/root/") &&
    fs.existsSync(currentScript)
  ) {
    return { command: process.execPath, args: [currentScript, ...extraArgs] };
  }
  const execName = path.basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(execName)) {
    return { command: process.execPath, args: extraArgs };
  }
  return { command: "pi", args: extraArgs };
}

export const MAX_WORKFLOW_DEPTH = 3;
export const WORKFLOW_DEPTH_ENV = "PI_WORKFLOWS_DEPTH";

export function currentWorkflowDepth(): number {
  const raw = process.env[WORKFLOW_DEPTH_ENV];
  const n = raw == null || raw === "" ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const execFileAsync = promisify(execFile);

/**
 * Create an isolated git worktree for one agent and return its dir + cleanup.
 * Uses `git worktree add --detach` so concurrent agents never collide on a
 * branch name. Throws a clear error when cwd is not inside a git repo.
 */
export async function setupAgentWorktree(
  repoCwd: string,
  label: string,
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const safeLabel = label.replace(/[^\w.-]+/g, "_").slice(0, 40) || "agent";
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoCwd });
  } catch {
    throw new Error(
      `agent "${label}" requested worktree:true, but ${repoCwd} is not inside a git repository. ` +
        "Run the workflow from a git checkout or drop worktree:true.",
    );
  }
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `pi-workflow-${safeLabel}-`));
  // mkdtemp creates the dir; worktree add needs a non-existent path.
  await fs.promises.rmdir(dir);
  try {
    await execFileAsync("git", ["worktree", "add", "--detach", dir], { cwd: repoCwd });
  } catch (err) {
    throw new Error(
      `agent "${label}" could not create a git worktree: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const cleanup = async (): Promise<void> => {
    try {
      await execFileAsync("git", ["worktree", "remove", "--force", dir], { cwd: repoCwd });
    } catch {
      await fs.promises.rm(dir, { recursive: true, force: true });
      try {
        await execFileAsync("git", ["worktree", "prune"], { cwd: repoCwd });
      } catch {
        /* best effort */
      }
    }
  };
  return { dir, cleanup };
}

export function createAgentRunner(defaults: RunnerDefaults): AgentFn {
  return async (prompt: string, options: AgentOptions = {}): Promise<AgentResult> => {
    const depth = currentWorkflowDepth();
    if (depth >= MAX_WORKFLOW_DEPTH) {
      throw new Error(
        `workflow nesting depth ${depth} exceeds limit ${MAX_WORKFLOW_DEPTH} (${WORKFLOW_DEPTH_ENV}). ` +
          "Refuse to spawn: this usually means a workflow agent re-entered the runner.",
      );
    }
    const argv: string[] = ["--mode", "json", "-p", "--no-session"];
    const model = options.model ?? defaults.model;
    if (defaults.provider) argv.push("--provider", defaults.provider);
    if (model) argv.push("--model", model);
    if (defaults.tools?.length) argv.push("--tools", defaults.tools.join(","));

    let tmpDir: string | null = null;
    if (options.systemPrompt?.trim()) {
      tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-workflow-"));
      const file = path.join(tmpDir, "system-prompt.md");
      await fs.promises.writeFile(file, options.systemPrompt, { encoding: "utf-8", mode: 0o600 });
      argv.push("--append-system-prompt", file);
    }
    argv.push(`Task: ${prompt}`);

    let worktree: { dir: string; cleanup: () => Promise<void> } | null = null;
    let childCwd = defaults.cwd;
    if (options.worktree === true) {
      worktree = await setupAgentWorktree(defaults.cwd, options.label ?? "agent");
      childCwd = worktree.dir;
    }

    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    let turns = 0;
    let finalText = "";
    let stderr = "";
    let stopReason: string | undefined;
    let errorMessage: string | undefined;

    let wasAborted = false;
    const exitCode = await new Promise<number>((resolve) => {
      const invocation = getPiInvocation(argv);
      const proc = spawn(invocation.command, invocation.args, {
        cwd: childCwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, [WORKFLOW_DEPTH_ENV]: String(depth + 1) },
      });
      let buffer = "";
      const kill = (): void => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* already exited */
          }
        }, 5000).unref?.();
      };
      const timer =
        defaults.timeoutMs != null
          ? setTimeout(() => proc.kill("SIGTERM"), defaults.timeoutMs)
          : undefined;
      const signal = options.signal;
      if (signal?.aborted) kill();
      else signal?.addEventListener("abort", kill, { once: true });

      const processLine = (line: string): void => {
        if (!line.trim()) return;
        let event: { type?: string; message?: Record<string, unknown> };
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (event.type === "message_end" && event.message) {
          const msg = event.message as {
            role?: string;
            content?: Array<{ type: string; text?: string }>;
            usage?: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
              cost?: { total?: number };
            };
            model?: string;
            stopReason?: string;
            errorMessage?: string;
          };
          if (msg.role === "assistant") {
            turns++;
            if (msg.usage) {
              usage.input += msg.usage.input ?? 0;
              usage.output += msg.usage.output ?? 0;
              usage.cacheRead += msg.usage.cacheRead ?? 0;
              usage.cacheWrite += msg.usage.cacheWrite ?? 0;
              usage.cost += msg.usage.cost?.total ?? 0;
            }
            for (const part of msg.content ?? []) {
              if (part.type === "text" && part.text) finalText = part.text;
            }
            if (msg.stopReason) stopReason = msg.stopReason;
            if (msg.errorMessage) errorMessage = msg.errorMessage;
          }
        }
      };

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });
      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("close", (code) => {
        if (buffer.trim()) processLine(buffer);
        clearTimeout(timer);
        signal?.removeEventListener("abort", kill);
        resolve(code ?? 0);
      });
      proc.on("error", () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", kill);
        resolve(1);
      });
    });

    if (worktree) await worktree.cleanup();
    if (tmpDir) await fs.promises.rm(tmpDir, { recursive: true, force: true });

    if (wasAborted || options.signal?.aborted) {
      throw new Error(`agent "${options.label ?? "unnamed"}" aborted`);
    }

    if (exitCode !== 0 || stopReason === "error") {
      throw new Error(
        `agent "${options.label ?? "unnamed"}" failed (exit ${exitCode}): ${errorMessage || stderr.trim() || "(no output)"}`,
      );
    }

    let output = truncate(finalText || "(no output)");
    if (options.schema === "json" || options.schema?.startsWith("{")) {
      try {
        JSON.parse(output);
      } catch {
        throw new Error(`agent "${options.label ?? "unnamed"}" did not return valid JSON as required by schema`);
      }
    }

    return { output, label: options.label, phase: options.phase, model, turns, usage, cwd: childCwd };
  };
}
