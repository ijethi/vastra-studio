import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ARC_ORDER, minSelection, orderForArc, selectionIsValid, suggestArc } from "./arc";
import { SCENES } from "./scenes";
import type { ReelShotType } from "@/lib/db/schema";

const still = (id: string, shotType: ReelShotType, orderIndex: number) => ({ id, shotType, orderIndex });

/** The nine festive stills as the worker would store them, in scene order. */
const festive = SCENES.festive.map((s, i) => still(`s${i}`, s.shotType, i));

describe("orderForArc", () => {
  it("plays wide, full body, movement, detail, portrait, then repeats in sketch order", () => {
    const ordered = orderForArc([...festive].reverse());
    const types = ordered.map((s) => s.shotType);
    let rank = -1;
    for (const t of types) {
      const r = ARC_ORDER.indexOf(t);
      assert.ok(r >= rank, `${t} came after a later arc position`);
      rank = r;
    }
    // Two stills of one type keep their sketch order.
    const wides = ordered.filter((s) => s.shotType === "wide-hook").map((s) => s.orderIndex);
    assert.deepEqual(wides, [...wides].sort((a, b) => a - b));
  });

  it("does not mutate its input", () => {
    const input = [...festive].reverse();
    const copy = [...input];
    orderForArc(input);
    assert.deepEqual(input, copy);
  });
});

describe("suggestArc", () => {
  it("picks one still per arc position, in playback order", () => {
    const picked = suggestArc(festive, 5);
    assert.equal(picked.length, 5);
    assert.deepEqual(
      picked.map((s) => s.shotType),
      ["wide-hook", "full-body", "movement", "detail", "hero-portrait"],
    );
  });

  it("fills from the earliest remaining stills when a type is missing", () => {
    const noDetail = festive.filter((s) => s.shotType !== "detail");
    const picked = suggestArc(noDetail, 5);
    assert.equal(picked.length, 5);
    assert.ok(!picked.some((s) => s.shotType === "detail"));
    assert.deepEqual(picked, orderForArc(picked));
  });

  it("never exceeds the maximum or the number available", () => {
    assert.equal(suggestArc(festive, 9).length, 6);
    assert.equal(suggestArc(festive.slice(0, 2), 5).length, 2);
    assert.equal(suggestArc([], 5).length, 0);
  });

  it("works for every vibe's scene list", () => {
    for (const vibe of Object.keys(SCENES) as Array<keyof typeof SCENES>) {
      const stills = SCENES[vibe].map((s, i) => still(`${vibe}-${i}`, s.shotType, i));
      assert.equal(stills.length, 9, `${vibe} has nine scenes`);
      assert.equal(suggestArc(stills).length, 5);
    }
  });
});

describe("selection rules", () => {
  it("needs three, or everything when fewer than three passed", () => {
    assert.equal(minSelection(9), 3);
    assert.equal(minSelection(2), 2);
    assert.equal(minSelection(0), 1);
  });

  it("accepts three to six known, distinct stills", () => {
    assert.equal(selectionIsValid(["s0", "s1", "s2"], festive), true);
    assert.equal(selectionIsValid(["s0", "s1", "s2", "s3", "s4", "s5"], festive), true);
    assert.equal(selectionIsValid(["s0", "s1"], festive), false);
    assert.equal(selectionIsValid(["s0", "s1", "s2", "s3", "s4", "s5", "s6"], festive), false);
    assert.equal(selectionIsValid(["s0", "s0", "s1"], festive), false);
    assert.equal(selectionIsValid(["s0", "s1", "nope"], festive), false);
  });
});
