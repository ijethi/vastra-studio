import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeRedisScriptRunner, MemorySlidingWindow, RedisSlidingWindow, type RateLimiter } from "./rate-limit";

/** A controllable clock so the window can be moved without sleeping. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function behavesLikeSlidingWindow(name: string, make: (now: () => number) => RateLimiter) {
  describe(name, () => {
    it("admits up to max hits in the window and refuses the next", async () => {
      const c = clock();
      const rl = make(c.now);
      for (let i = 0; i < 3; i++) {
        const d = await rl.hit("k", 3, 60_000);
        assert.equal(d.ok, true, `hit ${i + 1} admitted`);
        assert.equal(d.remaining, 2 - i);
      }
      const refused = await rl.hit("k", 3, 60_000);
      assert.equal(refused.ok, false);
      assert.equal(refused.remaining, 0);
      assert.ok(refused.retryAfterSec >= 1 && refused.retryAfterSec <= 60, `retryAfter ${refused.retryAfterSec}`);
    });

    it("slides: a hit is forgotten once it leaves the window", async () => {
      const c = clock();
      const rl = make(c.now);
      await rl.hit("k", 2, 10_000);
      c.advance(4_000);
      await rl.hit("k", 2, 10_000);
      assert.equal((await rl.hit("k", 2, 10_000)).ok, false);
      c.advance(6_001); // first hit is now outside the window, second still inside
      const d = await rl.hit("k", 2, 10_000);
      assert.equal(d.ok, true);
      assert.equal((await rl.hit("k", 2, 10_000)).ok, false);
    });

    it("reports when to retry based on the oldest hit", async () => {
      const c = clock();
      const rl = make(c.now);
      await rl.hit("k", 1, 30_000);
      c.advance(10_000);
      const d = await rl.hit("k", 1, 30_000);
      assert.equal(d.ok, false);
      assert.equal(d.retryAfterSec, 20);
    });

    it("keeps keys independent", async () => {
      const rl = make(clock().now);
      await rl.hit("a", 1, 60_000);
      assert.equal((await rl.hit("a", 1, 60_000)).ok, false);
      assert.equal((await rl.hit("b", 1, 60_000)).ok, true);
    });
  });
}

behavesLikeSlidingWindow("MemorySlidingWindow", (now) => new MemorySlidingWindow(now));
behavesLikeSlidingWindow("RedisSlidingWindow (fake script runner)", (now) => new RedisSlidingWindow(new FakeRedisScriptRunner(), { now }));

describe("RedisSlidingWindow", () => {
  it("prefixes keys and sends one script call per decision", async () => {
    const fake = new FakeRedisScriptRunner();
    const rl = new RedisSlidingWindow(fake, { prefix: "t", now: clock().now });
    await rl.hit("upload:tenant:org_1", 5, 1000);
    assert.equal(fake.calls, 1);
    assert.deepEqual([...fake.sets.keys()], ["t:upload:tenant:org_1"]);
  });

  it("fails open when Redis errors, and reports the error", async () => {
    const fake = new FakeRedisScriptRunner();
    fake.failWith = new Error("ECONNREFUSED");
    const errors: unknown[] = [];
    const rl = new RedisSlidingWindow(fake, { onError: (e) => errors.push(e) });
    const d = await rl.hit("k", 1, 1000);
    assert.equal(d.ok, true);
    assert.equal(errors.length, 1);
    assert.match((errors[0] as Error).message, /ECONNREFUSED/);
  });

  it("is shared across instances that talk to the same Redis", async () => {
    const fake = new FakeRedisScriptRunner();
    const c = clock();
    const a = new RedisSlidingWindow(fake, { now: c.now });
    const b = new RedisSlidingWindow(fake, { now: c.now });
    assert.equal((await a.hit("k", 2, 60_000)).ok, true);
    assert.equal((await b.hit("k", 2, 60_000)).ok, true);
    assert.equal((await a.hit("k", 2, 60_000)).ok, false, "the second instance's hit counted");
  });
});
