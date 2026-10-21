import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SignedUpload, StorageAdapter } from "./types";
import { env } from "@/env";

const ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./.data/storage");

/** Reject anything that could escape the storage root. */
export function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_.\-]{0,400}$/.test(key) || key.includes("..") || key.includes("//")) {
    throw new Error("Invalid storage key");
  }
}

function filePath(key: string): string {
  assertSafeKey(key);
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) throw new Error("Invalid storage key");
  return p;
}

type TokenPayload = { k: string; e: number; m: "r" | "w"; ct?: string; mb?: number };

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", env.AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyLocalToken(token: string, mode: "r" | "w"): TokenPayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", env.AUTH_SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.m !== mode || payload.e < Date.now()) return null;
  try {
    assertSafeKey(payload.k);
  } catch {
    return null;
  }
  return payload;
}

/**
 * Local filesystem storage for development and single-box deployments.
 * Mirrors the S3 semantics: private objects, HMAC-signed, expiring URLs.
 */
export class LocalStorage implements StorageAdapter {
  async put(key: string, body: Buffer): Promise<void> {
    const p = filePath(key);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, body);
  }
  async get(key: string): Promise<Buffer> {
    return fs.readFile(filePath(key));
  }
  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(filePath(key));
      return true;
    } catch {
      return false;
    }
  }
  async delete(key: string): Promise<void> {
    await fs.rm(filePath(key), { force: true });
  }
  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(filePath(prefix), { recursive: true, force: true });
  }
  async signUpload(key: string, contentType: string, maxBytes: number, ttlSeconds: number): Promise<SignedUpload> {
    assertSafeKey(key);
    const e = Date.now() + ttlSeconds * 1000;
    const token = sign({ k: key, e, m: "w", ct: contentType, mb: maxBytes });
    return {
      url: `${env.APP_URL}/api/storage/upload?token=${encodeURIComponent(token)}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      key,
      expiresAt: new Date(e).toISOString(),
    };
  }
  async signRead(key: string, ttlSeconds: number): Promise<string> {
    assertSafeKey(key);
    const e = Date.now() + ttlSeconds * 1000;
    const token = sign({ k: key, e, m: "r" });
    return `/api/storage/read?token=${encodeURIComponent(token)}`;
  }
}
