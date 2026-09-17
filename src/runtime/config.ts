/**
 * Trigger detection + runtime settings for pi-workflows.
 *
 * Kept in its own module (no pi imports) so it stays unit-testable with
 * plain node --test.
 */

import type { SizeGuideline } from "./types.ts";

export const TRIGGER_KEYWORD = "ultracode";

/** Runtime settings via env (documented in README):
 *  PI_WORKFLOWS_DISABLE=1 disables the workflow tool guidance,
 *  PI_WORKFLOWS_SIZE=small|medium|large|unrestricted sets the default size,
 *  PI_WORKFLOWS_MAX_CONCURRENCY / PI_WORKFLOWS_MAX_AGENTS tune the caps. */
export function defaultSize(): SizeGuideline {
  const raw = (process.env.PI_WORKFLOWS_SIZE ?? "").toLowerCase();
  return raw === "small" || raw === "medium" || raw === "large" || raw === "unrestricted" ? raw : "medium";
}

export function isWorkflowsDisabled(): boolean {
  return process.env.PI_WORKFLOWS_DISABLE === "1";
}

export function resolveConcurrency(numCpus: number): number {
  const override = Number.parseInt(process.env.PI_WORKFLOWS_MAX_CONCURRENCY ?? "", 10);
  if (Number.isFinite(override) && override > 0) return Math.min(16, override);
  return Math.max(2, Math.min(16, numCpus || 4));
}

export function resolveMaxAgents(): number {
  const override = Number.parseInt(process.env.PI_WORKFLOWS_MAX_AGENTS ?? "", 10);
  if (Number.isFinite(override) && override > 0) return override;
  return 1000;
}

export function requestsWorkflow(text: string): boolean {
  if (new RegExp(`\\b${TRIGGER_KEYWORD}\\b`, "i").test(text)) return true;
  return /\buse\s+a\s+workflow\b|\brun\s+(this\s+as\s+)?a\s+workflow\b/i.test(text);
}
