import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemo } from "./memo";

describe("createMemo", () => {
  it("loads once within the ttl and again after it", async () => {
    let t = 0;
    let loads = 0;
    const memo = createMemo(async () => ++loads, 1000, () => t);
    assert.equal(await memo.get(), 1);
    assert.equal(await memo.get(), 1);
    t = 999;
    assert.equal(await memo.get(), 1);
    t = 1000;
    assert.equal(await memo.get(), 2);
    assert.equal(loads, 2);
  });

  it("coalesces concurrent loads into one call", async () => {
    let loads = 0;
    const memo = createMemo(async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 5));
      return "v";
    }, 1000);
    await Promise.all([memo.get(), memo.get(), memo.get()]);
    assert.equal(loads, 1);
  });

  it("invalidate() and fresh:true force a reload", async () => {
    let loads = 0;
    const memo = createMemo(async () => ++loads, 60_000);
    await memo.get();
    memo.invalidate();
    assert.equal(await memo.get(), 2);
    assert.equal(await memo.get({ fresh: true }), 3);
    assert.equal(await memo.get(), 3);
  });

  it("does not cache a failed load", async () => {
    let calls = 0;
    const memo = createMemo(async () => {
      calls++;
      if (calls === 1) throw new Error("db down");
      return "ok";
    }, 60_000);
    await assert.rejects(memo.get(), /db down/);
    assert.equal(await memo.get(), "ok");
  });
});
