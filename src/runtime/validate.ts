/**
 * Validation for workflow meta + script.
 * The script runs in a locked-down vm context (see sandbox.ts), so this is
 * defense-in-depth: fail fast with a clear error the LLM can act on, rather
 * than a cryptic vm failure mid-run.
 */

import type { WorkflowMeta } from "./types.ts";

const BANNED_APIS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /\brequire\s*\(/, message: "require() is not available in workflow scripts; only spawned agents can use tools" },
  { pattern: /\bprocess\b/, message: "'process' is not available in workflow scripts" },
  { pattern: /\bchild_process\b/, message: "spawning processes from the script is banned; use agent()" },
  { pattern: /\bfs\b/, message: "filesystem access from the script is banned; only spawned agents can read/write files" },
  { pattern: /\bfetch\s*\(/, message: "fetch() from the script is banned; use an agent to access the network" },
  { pattern: /\bXMLHttpRequest\b/, message: "network access from the script is banned; use an agent" },
  { pattern: /\beval\s*\(/, message: "eval() is banned in workflow scripts" },
  { pattern: /\bFunction\s*\(/, message: "Function() constructor is banned in workflow scripts" },
  { pattern: /\bDate\s*\.\s*now\s*\(/, message: "Date.now() is banned (workflows must be deterministic)" },
  { pattern: /\bMath\s*\.\s*random\s*\(/, message: "Math.random() is banned (workflows must be deterministic)" },
  { pattern: /\bsetTimeout\b|\bsetInterval\b/, message: "timers are banned; sequence agents with await/parallel()/pipeline()" },
];

export function validateMeta(meta: unknown): asserts meta is WorkflowMeta {
  if (typeof meta !== "object" || meta === null) {
    throw new Error("workflow meta must be an object with { name, description, phases? }");
  }
  const m = meta as Record<string, unknown>;
  if (typeof m.name !== "string" || !m.name.trim()) {
    throw new Error("workflow meta.name is required (non-empty string)");
  }
  if (typeof m.description !== "string" || !m.description.trim()) {
    throw new Error("workflow meta.description is required (non-empty string)");
  }
  if (m.phases !== undefined) {
    if (!Array.isArray(m.phases)) throw new Error("workflow meta.phases must be an array of { title }");
    for (const p of m.phases) {
      if (typeof p !== "object" || p === null || typeof (p as { title?: unknown }).title !== "string") {
        throw new Error("each workflow meta.phases entry must be { title: string }");
      }
    }
  }
}

export function validateScript(script: string): void {
  if (typeof script !== "string" || !script.trim()) {
    throw new Error("workflow script must be a non-empty string");
  }
  if (!/(const|let|var)\s+meta\s*=/.test(script)) {
    throw new Error("workflow script must declare `meta` (e.g. `const meta = { name, description }`)");
  }
  for (const { pattern, message } of BANNED_APIS) {
    if (pattern.test(script)) {
      throw new Error(`banned in workflow scripts: ${message}`);
    }
  }
}
