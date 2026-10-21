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
}
