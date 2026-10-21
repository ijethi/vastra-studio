import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { creditsForRun } from "./pricing";

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
