import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MockVideoProvider } from "./mock";
import { isMp4 } from "@/lib/reels/ffmpeg";
import { assembleReel, renderCaption, renderEndCard } from "@/lib/reels/assemble";
import { NEGATIVE_PROMPT, motionPrompt } from "./prompts";

/** A small portrait still: a coral block on ivory, enough for ffmpeg to pan over. */
async function still(): Promise<Buffer> {
  return sharp({ create: { width: 540, height: 960, channels: 3, background: "#f6f6f3" } })
    .composite([{ input: await sharp({ create: { width: 220, height: 500, channels: 3, background: "#f08070" } }).png().toBuffer(), left: 160, top: 200 }])
    .jpeg()
    .toBuffer();
}

/** Size of the first "ftyp" box and its brand, read straight from the bytes. */
function ftyp(buf: Buffer): { size: number; brand: string } {
  return { size: buf.readUInt32BE(0), brand: buf.toString("latin1", 8, 12) };
}

describe("MockVideoProvider", () => {
  it("renders a Ken Burns clip as a valid MP4 with the ftyp box first", async () => {
    const provider = new MockVideoProvider();
    const out = await provider.animate({
      image: await still(),
      prompt: motionPrompt({ shotType: "movement", analysis: null, title: "coral kurta", vibe: "festive", sceneLabel: "Market walk" }),
      negativePrompt: NEGATIVE_PROMPT,
      durationSec: 1,
      aspect: "9:16",
      shotType: "movement",
      timeoutMs: 120_000,
    });
    assert.equal(out.contentType, "video/mp4");
    assert.equal(out.width, 1080);
    assert.equal(out.height, 1920);
    assert.ok(out.video.length > 2000, "clip has content");
    assert.ok(isMp4(out.video), "starts with an ISO media box");
    const box = ftyp(out.video);
    assert.ok(box.size >= 16 && box.size < 64, `ftyp box size ${box.size}`);
    assert.match(box.brand, /^(isom|mp42|iso[0-9a-z])$/);
    // faststart puts the moov atom before the media data.
    const head = out.video.subarray(0, 4096).toString("latin1");
    assert.ok(head.includes("moov"), "moov atom is near the start");
  });
});

describe("assembleReel", () => {
  it("stitches clips, caption and end card into one MP4", async () => {
    const provider = new MockVideoProvider();
    const image = await still();
    const base = { image, prompt: "p", negativePrompt: NEGATIVE_PROMPT, durationSec: 1, aspect: "9:16" as const, timeoutMs: 120_000 };
    const [a, b] = await Promise.all([provider.animate({ ...base, shotType: "wide-hook" }), provider.animate({ ...base, shotType: "detail" })]);
    const reel = await assembleReel({ clips: [a.video, b.video], caption: "Coral kurta · ₹2,499", boutiqueName: "Meera Couture", clipSeconds: 1, dissolveSeconds: 0.2, endCardSeconds: 1 });
    assert.ok(isMp4(reel.video), "reel is an MP4");
    assert.equal(reel.durationSec, 2.6); // 1 + 1 + 1 - two 0.2 s dissolves
    assert.ok(reel.video.length > a.video.length / 4, "reel has content");
  });

  it("renders the caption and end card layers at reel size", async () => {
    const cap = await sharp(await renderCaption("Coral kurta")).metadata();
    assert.equal(cap.width, 1080);
    assert.equal(cap.height, 1920);
    assert.equal(cap.hasAlpha, true);
    const end = await sharp(await renderEndCard("A boutique with a rather long name indeed")).metadata();
    assert.equal(end.width, 1080);
    assert.equal(end.height, 1920);
  });
});

describe("motionPrompt", () => {
  it("follows the guide's formula and keeps the hem in frame", () => {
    const p = motionPrompt({
      shotType: "full-body",
      analysis: { category: "one-piece", title: "anarkali", colour: "Coral", secondaryColours: [], sleeve: null, length: "full", neckline: null, fabricGuess: "georgette", print: "floral", usable: true, issues: [], confidence: 0.9 },
      title: "Coral anarkali",
      vibe: "editorial",
      sceneLabel: "Gallery stairs",
    });
    assert.match(p, /Coral floral print georgette anarkali/);
    assert.match(p, /Camera: /);
    assert.match(p, /Action: /);
    assert.match(p, /Lighting and mood: /);
    assert.match(p, /hem visible throughout/);
    assert.match(p, /keep full body in frame/);
  });
});
