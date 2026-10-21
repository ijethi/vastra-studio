import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { creditsForClip, creditsForClips, creditsForReelStills, creditsForRun, REEL_MAX_SELECTION, REEL_MIN_SELECTION, REEL_STILL_COUNT, refundPerFailedStill } from "./pricing";

describe("creditsForRun", () => {
  it("charges a flat 25 for one or two variations", () => {
    assert.equal(creditsForRun(1), 25);
    assert.equal(creditsForRun(2), 25);
  });
  it("adds 10 per extra variation up to four", () => {
    assert.equal(creditsForRun(3), 35);
    assert.equal(creditsForRun(4), 45);
    assert.equal(creditsForRun(9), 45);
  });
});

describe("reel pricing", () => {
  it("charges 60 for the nine stills and 40 per clip", () => {
    assert.equal(creditsForReelStills(), 60);
    assert.equal(creditsForClip(), 40);
    assert.equal(REEL_STILL_COUNT, 9);
  });
  it("prices a selection per clip within the three-to-six range", () => {
    assert.equal(creditsForClips(REEL_MIN_SELECTION), 120);
    assert.equal(creditsForClips(5), 200);
    assert.equal(creditsForClips(REEL_MAX_SELECTION), 240);
    assert.equal(creditsForClips(0), 0);
    assert.equal(creditsForClips(-2), 0);
  });
  it("refunds an equal share of the stills charge per failed still, never more than was charged", () => {
    assert.equal(refundPerFailedStill(), 6);
    assert.ok(refundPerFailedStill() * REEL_STILL_COUNT <= creditsForReelStills());
  });
});
