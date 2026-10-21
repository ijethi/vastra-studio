import "server-only";
import type { StorageAdapter } from "./types";
import { LocalStorage } from "./local";
import { env } from "@/env";

declare global {
   
  var __vastraStorage: StorageAdapter | undefined;
}

export function getStorage(): StorageAdapter {
  if (!globalThis.__vastraStorage) {
    if (env.STORAGE_DRIVER === "s3") {
      // Lazy import keeps the AWS SDK out of the local dev path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { S3Storage } = require("./s3") as typeof import("./s3");
      globalThis.__vastraStorage = new S3Storage();
    } else {
      globalThis.__vastraStorage = new LocalStorage();
    }
  }
  return globalThis.__vastraStorage;
}

/** Key layout. Everything a tenant owns lives under tenants/<tenantId>/ so deletion is one prefix. */
export const keys = {
  upload: (tenantId: string, uploadId: string) => `tenants/${tenantId}/uploads/${uploadId}`,
  garmentOriginal: (tenantId: string, garmentId: string) => `tenants/${tenantId}/garments/${garmentId}/original.jpg`,
  garmentThumb: (tenantId: string, garmentId: string) => `tenants/${tenantId}/garments/${garmentId}/thumb.jpg`,
  output: (tenantId: string, jobId: string, imageId: string) => `tenants/${tenantId}/jobs/${jobId}/${imageId}.jpg`,
  outputThumb: (tenantId: string, jobId: string, imageId: string) => `tenants/${tenantId}/jobs/${jobId}/${imageId}.thumb.jpg`,
  tenantPrefix: (tenantId: string) => `tenants/${tenantId}/`,
  garmentPrefix: (tenantId: string, garmentId: string) => `tenants/${tenantId}/garments/${garmentId}/`,
  jobPrefix: (tenantId: string, jobId: string) => `tenants/${tenantId}/jobs/${jobId}/`,
};

export const READ_URL_TTL_SECONDS = 60 * 60; // 1 hour
export const UPLOAD_URL_TTL_SECONDS = 5 * 60; // 5 minutes
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_PIXELS = 40_000_000; // decompression-bomb guard
