export type SignedUpload = {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  key: string;
  expiresAt: string;
};

export interface StorageAdapter {
  /** Write an object. Keys are tenant-prefixed by the caller. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Read a whole object into memory (images are small). */
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  deletePrefix(prefix: string): Promise<void>;
  /** Short-lived URL the browser PUTs the file to directly. */
  signUpload(key: string, contentType: string, maxBytes: number, ttlSeconds: number): Promise<SignedUpload>;
  /** Short-lived URL to read a private object. */
  signRead(key: string, ttlSeconds: number): Promise<string>;
  /**
   * Sign many keys at once (deduplicated, in parallel). Pages and the SSE
   * routes use this so a gallery of N images is one batch, not N awaits.
   */
  signReadMany(keys: string[], ttlSeconds: number): Promise<Map<string, string>>;
  /** Cheap liveness probe for /api/health: the bucket or directory is reachable. */
  ping(): Promise<void>;
}

/** Signed asset reads are immutable per key, so browsers and CDNs may keep them for a day. */
export const ASSET_CACHE_CONTROL = "private, max-age=86400, immutable";

/** Shared batching helper for adapters whose signing is per key. */
export async function signManyWith(sign: (key: string) => Promise<string>, keys: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(keys));
  const urls = await Promise.all(unique.map((k) => sign(k)));
  return new Map(unique.map((k, i) => [k, urls[i]]));
}
