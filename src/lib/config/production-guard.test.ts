import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatProductionIssues, productionIssues, type GuardInput } from "./production-guard";

const complete: GuardInput = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://app:pw@db.example.com/vastra",
  REDIS_URL: "redis://cache.example.com:6379",
  STORAGE_DRIVER: "s3",
  S3_BUCKET: "vastra",
  S3_ACCESS_KEY_ID: "AKIA",
  S3_SECRET_ACCESS_KEY: "secret",
  RESEND_API_KEY: "re_123",
  AUTH_SECRET: "x".repeat(40),
  VISION_PROVIDER: "claude",
  PERSON_PROVIDER: "gemini",
  STORYBOARD_PROVIDER: "gemini",
  TRYON_PROVIDERS: "gemini,google",
  VIDEO_PROVIDERS: "kling,gemini",
  SEGMENTER: "auto",
};

describe("productionIssues", () => {
  it("is silent outside production, whatever the config", () => {
    assert.deepEqual(productionIssues({ ...complete, NODE_ENV: "development", DATABASE_URL: "", STORAGE_DRIVER: "local", TRYON_PROVIDERS: "mock" }), []);
    assert.deepEqual(productionIssues({ ...complete, NODE_ENV: "test", REDIS_URL: "" }), []);
  });

  it("accepts a complete production configuration", () => {
    assert.deepEqual(productionIssues(complete), []);
  });

  it("lists every missing piece of infrastructure at once", () => {
    const issues = productionIssues({ ...complete, DATABASE_URL: "", REDIS_URL: " ", STORAGE_DRIVER: "local", S3_BUCKET: "", RESEND_API_KEY: "", AUTH_SECRET: "short" });
    const text = issues.join("\n");
    for (const key of ["DATABASE_URL", "REDIS_URL", "STORAGE_DRIVER", "S3_BUCKET", "RESEND_API_KEY", "AUTH_SECRET"]) {
      assert.match(text, new RegExp(key), `mentions ${key}`);
    }
    assert.ok(issues.length >= 6);
  });

  it("refuses every mock provider unless ALLOW_MOCK_PROVIDERS=1", () => {
    const mocks: GuardInput = { ...complete, VISION_PROVIDER: "mock", PERSON_PROVIDER: "mock", STORYBOARD_PROVIDER: "mock", TRYON_PROVIDERS: "gemini,mock", VIDEO_PROVIDERS: "mock", SEGMENTER: "mock" };
    const issues = productionIssues(mocks);
    assert.equal(issues.length, 6);
    assert.ok(issues.every((i) => i.startsWith("Mock provider in production")));
    assert.deepEqual(productionIssues({ ...mocks, ALLOW_MOCK_PROVIDERS: "1" }), []);
  });

  it("formats the list as one readable boot message", () => {
    const msg = formatProductionIssues(["DATABASE_URL is empty", "REDIS_URL is empty"]);
    assert.match(msg, /^Production configuration is incomplete/);
    assert.match(msg, /\n  - DATABASE_URL is empty\n  - REDIS_URL is empty\n/);
  });
});
