/**
 * Regression tests for the 2026-09-17 fork-bomb incident.
 *
 * getPiInvocation() used to trust process.argv[1] unconditionally. Under
 * `node --test`, argv[1] is the test file itself, so spawned "agents"
 * re-executed the test suite, which spawned more of itself exponentially.
 * These tests pin the fix without spending model calls.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  MAX_WORKFLOW_DEPTH,
  WORKFLOW_DEPTH_ENV,
  createAgentRunner,
  getPiInvocation,
  isPiEntryPoint,
  setupAgentWorktree,
} from "../src/runtime/agent-runner.ts";

const execFileAsync = promisify(execFile);

describe("fork-bomb guards", () => {
  it("does not mistake the test file for the pi entrypoint", () => {
    assert.match(process.argv[1] ?? "", /test/);
    assert.equal(isPiEntryPoint(process.argv[1] ?? ""), false);
  });

  it("getPiInvocation never targets the currently-running script", () => {
    const invocation = getPiInvocation(["--mode", "json"]);
    assert.notEqual(invocation.args[0], process.argv[1]);
    // Under plain node (not the pi binary) it must fall through to `pi` on PATH.
    assert.equal(invocation.command, "pi");
    assert.deepEqual(invocation.args, ["--mode", "json"]);
  });

  it("recognizes real pi entrypoints", () => {
    assert.equal(isPiEntryPoint("/usr/local/bin/pi"), true);
    assert.equal(isPiEntryPoint("C:/tools/pi.exe"), true);
    assert.equal(
      isPiEntryPoint("/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js"),
      true,
    );
    assert.equal(isPiEntryPoint("/repo/tests/live.test.ts"), false);
    assert.equal(isPiEntryPoint("/repo/node_modules/vitest/vitest.mjs"), false);
    assert.equal(isPiEntryPoint("/repo/packages/coding-agent/dist/bundle/cli.js"), false);
  });

  it("worktree:true outside a git repo fails before spawning", async () => {
    const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-wf-notrepo-"));
    try {
      const runner = createAgentRunner({ cwd: outside });
      // setupAgentWorktree throws before any subprocess is spawned: no model cost.
      await assert.rejects(() => runner("should never spawn", { label: "wt-fail", worktree: true }), /not inside a git/);
    } finally {
      await fs.promises.rm(outside, { recursive: true, force: true });
    }
  });

  it("worktree round-trips in a temp repo and cleans up", async () => {
    const repo = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pi-wf-repo-"));
    try {
      await execFileAsync("git", ["init", "-q", repo]);
      await execFileAsync("git", ["-C", repo, "config", "user.email", "test@example.com"]);
      await execFileAsync("git", ["-C", repo, "config", "user.name", "test"]);
      await fs.promises.writeFile(path.join(repo, "f.txt"), "hi\n");
      await execFileAsync("git", ["-C", repo, "add", "."]);
      await execFileAsync("git", ["-C", repo, "commit", "-qm", "init"]);
      const wt = await setupAgentWorktree(repo, "my-agent");
      try {
        const head = (await execFileAsync("git", ["-C", wt.dir, "rev-parse", "--is-inside-work-tree"])).stdout.trim();
        assert.equal(head, "true");
        assert.ok((await fs.promises.readFile(path.join(wt.dir, "f.txt"), "utf8")) === "hi\n");
      } finally {
        await wt.cleanup();
      }
      await assert.rejects(() => fs.promises.access(wt.dir), /ENOENT/);
      const list = (await execFileAsync("git", ["-C", repo, "worktree", "list", "--porcelain"])).stdout;
      assert.equal(list.trim().split("\n").filter((l) => l.startsWith("worktree ")).length, 1);
    } finally {
      await fs.promises.rm(repo, { recursive: true, force: true });
    }
  });

  it("refuses to spawn past the nesting depth limit", async () => {
    const prev = process.env[WORKFLOW_DEPTH_ENV];
    process.env[WORKFLOW_DEPTH_ENV] = String(MAX_WORKFLOW_DEPTH);
    try {
      const runner = createAgentRunner({ cwd: process.cwd() });
      await assert.rejects(() => runner("should never spawn", { label: "depth-guard" }), /nesting depth/);
    } finally {
      if (prev === undefined) delete process.env[WORKFLOW_DEPTH_ENV];
      else process.env[WORKFLOW_DEPTH_ENV] = prev;
    }
  });
});
