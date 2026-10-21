import type { GarmentCategory } from "@/lib/db/schema";

export type TryOnInput = {
  /** JPEG/PNG bytes of the base model (person) image. */
  modelImage: Buffer;
  /** JPEG/PNG bytes of the garment photo (flat-lay, hanger or mannequin). */
  garmentImage: Buffer;
  category: GarmentCategory;
  garmentPhotoType: "flat-lay" | "on-model" | "auto";
  seed?: number;
  /** Provider quality mode; providers map it to their own options. */
  quality: "balanced" | "quality";
  /** Hard ceiling for the provider call. */
  timeoutMs: number;
};

export type TryOnOutput = {
  image: Buffer;
  contentType: "image/jpeg" | "image/png";
  width: number;
  height: number;
  seed: number | null;
  provider: string;
  providerRef?: string;
  costUsd?: number;
};

export class TryOnProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable: boolean,
    public status?: number,
  ) {
    super(`[${provider}] ${message}`);
  }
}

export interface TryOnProvider {
  readonly name: string;
  /** Resolve true when configured and healthy enough to accept traffic. */
  isAvailable(): Promise<boolean>;
  generate(input: TryOnInput): Promise<TryOnOutput>;
}
