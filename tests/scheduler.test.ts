import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Scheduler } from "../src/runtime/scheduler.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("scheduler", () => {
  it("bounds concurrency", async () => {
    const s = new Scheduler(2, 100);
    let live = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        s.schedule(`t${i}`, async () => {
          live++;
          peak = Math.max(peak, live);
          await tick();
          live--;
          return i;
        }),
      ),
    );
    assert.equal(peak, 2);
    assert.equal(s.totalSpawned, 6);
  });

  it("rejects past the total cap", async () => {
    const s = new Scheduler(4, 2);
    await s.schedule("a", async () => 1);
    await s.schedule("b", async () => 2);
    await assert.rejects(() => s.schedule("c", async () => 3), /agent cap reached/);
  });
});
