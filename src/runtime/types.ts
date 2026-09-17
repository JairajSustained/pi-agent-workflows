/**
 * Shared types for the pi-workflows extension.
 *
 * A workflow is a JS script (plain JS + top-level await) that orchestrates
 * isolated subagents. The script declares `meta` and calls the injected
 * globals: agent(), parallel(), pipeline(), phase(), log().
 * Intermediate results live in script variables; only the script's return
 * value reaches the parent agent's context.
 */

export interface WorkflowPhase {
  title: string;
}

export interface WorkflowMeta {
  name: string;
  description: string;
  phases?: WorkflowPhase[];
}

export interface AgentOptions {
  /** Short label for progress UI, e.g. "auth-audit-Verify" */
  label?: string;
  /** Phase title this agent belongs to (must match a meta.phases title if given) */
  phase?: string;
  /** If set, the agent's final text output must parse as JSON against this hint ("json" = any JSON) */
  schema?: string;
  /** Model override for this agent, e.g. "anthropic/claude-haiku-4-5" */
  model?: string;
  /** Run this agent in its own git worktree */
  worktree?: boolean;
  /** Extra system prompt framing this agent's role (task prompt carries the work) */
  systemPrompt?: string;
  /** AbortSignal (from the workflow run) — the runner kills the subprocess on abort */
  signal?: AbortSignal;
}

export interface AgentResult {
  output: string;
  /** Directory the agent ran in (equals the worktree dir when worktree:true) */
  cwd?: string;
  /** True when replayed from a previous run's cache (resume) — not re-executed */
  cached?: boolean;
  label?: string;
  phase?: string;
  model?: string;
  turns: number;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
  };
}

export type AgentFn = (prompt: string, options?: AgentOptions) => Promise<AgentResult>;

export type SizeGuideline = "small" | "medium" | "large" | "unrestricted";

export const SIZE_TARGETS: Record<SizeGuideline, number | null> = {
  small: 5,
  medium: 15,
  large: 50,
  unrestricted: null,
};

export interface RunConfig {
  maxConcurrency: number;
  maxAgents: number;
  size: SizeGuideline;
  defaultModel?: string;
  defaultCwd: string;
}

export const DEFAULT_RUN_CONFIG: Omit<RunConfig, "defaultCwd"> = {
  maxConcurrency: 8,
  maxAgents: 1000,
  size: "medium",
};
