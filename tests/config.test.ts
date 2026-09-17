import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSize, isWorkflowsDisabled, requestsWorkflow, resolveConcurrency, resolveMaxAgents } from "../src/runtime/config.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k] as string;
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k] as string;
    }
  }
}

describe("triggers + settings", () => {
  it("detects the keyword and natural-language requests", () => {
    assert.equal(requestsWorkflow("ultracode: audit the auth module"), true);
    assert.equal(requestsWorkflow("Please ULTRACODE this migration"), true);
    assert.equal(requestsWorkflow("use a workflow to check every route"), true);
    assert.equal(requestsWorkflow("run this as a workflow"), true);
    assert.equal(requestsWorkflow("just fix the typo"), false);
    assert.equal(requestsWorkflow("how do workflows work?"), false);
  });

  it("reads size/disable/caps from env with safe defaults", () => {
    withEnv({ PI_WORKFLOWS_SIZE: "small" }, () => assert.equal(defaultSize(), "small"));
    withEnv({ PI_WORKFLOWS_SIZE: "bogus" }, () => assert.equal(defaultSize(), "medium"));
    withEnv({ PI_WORKFLOWS_SIZE: undefined }, () => assert.equal(defaultSize(), "medium"));
    withEnv({ PI_WORKFLOWS_DISABLE: "1" }, () => assert.equal(isWorkflowsDisabled(), true));
    withEnv({ PI_WORKFLOWS_DISABLE: undefined }, () => assert.equal(isWorkflowsDisabled(), false));
    withEnv({ PI_WORKFLOWS_MAX_AGENTS: "50" }, () => assert.equal(resolveMaxAgents(), 50));
    withEnv({ PI_WORKFLOWS_MAX_AGENTS: undefined }, () => assert.equal(resolveMaxAgents(), 1000));
    withEnv({ PI_WORKFLOWS_MAX_CONCURRENCY: "4" }, () => assert.equal(resolveConcurrency(16), 4));
    withEnv({ PI_WORKFLOWS_MAX_CONCURRENCY: "99" }, () => assert.equal(resolveConcurrency(16), 16));
    withEnv({ PI_WORKFLOWS_MAX_CONCURRENCY: undefined }, () => assert.equal(resolveConcurrency(18), 16));
  });
});
