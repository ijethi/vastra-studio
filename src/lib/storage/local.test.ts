import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { LocalStorage, verifyLocalToken, assertSafeKey } from "./local";

describe("LocalStorage signed URLs", () => {
  const storage = new LocalStorage();

  it("issues an upload token that verifies for writes only", async () => {
    const signed = await storage.signUpload("tenants/t1/uploads/up_1", "image/jpeg", 1000, 60);
    const token = new URL(signed.url).searchParams.get("token")!;
    const write = verifyLocalToken(token, "w");
    assert.equal(write?.k, "tenants/t1/uploads/up_1");
    assert.equal(write?.ct, "image/jpeg");
    assert.equal(write?.mb, 1000);
    assert.equal(verifyLocalToken(token, "r"), null);
  });

  it("rejects tampered tokens", async () => {
    const url = await storage.signRead("tenants/t1/garments/g1/thumb.jpg", 60);
    const token = new URL(url, "http://x").searchParams.get("token")!;
    const [body, mac] = token.split(".");
    assert.equal(verifyLocalToken(`${body}.${mac.slice(0, -2)}aa`, "r"), null);
    assert.equal(verifyLocalToken(`${body}x.${mac}`, "r"), null);
  });

  it("rejects expired tokens", async () => {
    const url = await storage.signRead("tenants/t1/garments/g1/thumb.jpg", -1);
    const token = new URL(url, "http://x").searchParams.get("token")!;
    assert.equal(verifyLocalToken(token, "r"), null);
  });
});

describe("assertSafeKey", () => {
  it("blocks path traversal and absolute paths", () => {
    assert.throws(() => assertSafeKey("../etc/passwd"));
    assert.throws(() => assertSafeKey("tenants/../../x"));
    assert.throws(() => assertSafeKey("/abs/path"));
    assert.throws(() => assertSafeKey("tenants//x"));
  });
  it("allows normal tenant keys", () => {
    assert.doesNotThrow(() => assertSafeKey("tenants/org_1/jobs/job_1/img_1.jpg"));
  });
});
