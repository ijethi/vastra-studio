import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Auth tables (shape required by better-auth + organization plugin)   */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** A boutique. One organization = one tenant. */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: text("metadata"),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("member_org_idx").on(t.organizationId), index("member_user_idx").on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("invitation_org_idx").on(t.organizationId)],
);

/* ------------------------------------------------------------------ */
/* Application tables. Every tenant-owned row carries tenant_id.       */
/* ------------------------------------------------------------------ */

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("trial"), // trial | credits | monthly
  country: text("country").notNull().default("IN"),
  defaultBaseModelId: text("default_base_model_id"),
  defaultBackdrop: text("default_backdrop").notNull().default("studio-ivory"),
  defaultVariations: integer("default_variations").notNull().default(2),
  watermarkEnabled: boolean("watermark_enabled").notNull().default(false),
  /** Start generating with the house defaults as soon as a photo is uploaded. */
  autoGenerate: boolean("auto_generate").notNull().default(true),
  creditsBalance: integer("credits_balance").notNull().default(0),
  dailySpendCapCredits: integer("daily_spend_cap_credits").notNull().default(500),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GarmentCategory =
  | "top"
  | "bottom"
  | "one-piece"
  | "set"
  | "saree"
  | "lehenga"
  | "unknown";

/** How the garment was photographed. Mannequin photos qualify for exact-garment mode. */
export type PhotoType = "mannequin" | "flat-lay" | "hanger" | "on-model";

export type GarmentAnalysis = {
  category: GarmentCategory;
  /** Missing on rows analysed before exact-garment mode existed; readers treat that as unknown. */
  photoType?: PhotoType;
  title: string;
  colour: string;
  secondaryColours: string[];
  sleeve: string | null;
  length: string | null;
  neckline: string | null;
  fabricGuess: string | null;
  print: string | null;
  usable: boolean;
  issues: string[];
  confidence: number;
};

export const garments = pgTable(
  "garments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled piece"),
    category: text("category").notNull().default("unknown"),
    colour: text("colour"),
    analysis: jsonb("analysis").$type<GarmentAnalysis | null>(),
    originalKey: text("original_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    status: text("status").notNull().default("uploaded"), // uploaded | analysing | ready | unusable
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("garments_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

/** Extra angles of a garment: back and detail shots improve reels and future try-on fidelity. */
export type GarmentPhotoKind = "back" | "detail" | "other";

export const garmentPhotos = pgTable(
  "garment_photos",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    garmentId: text("garment_id")
      .notNull()
      .references(() => garments.id, { onDelete: "cascade" }),
    kind: text("kind").$type<GarmentPhotoKind>().notNull().default("other"),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("garment_photos_garment_idx").on(t.garmentId)],
);

export type JobStatus =
  | "queued"
  | "analysing"
  | "generating"
  | "finishing"
  | "gating"
  | "completed"
  | "partially_completed"
  | "failed"
  | "refunded";

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    garmentId: text("garment_id")
      .notNull()
      .references(() => garments.id, { onDelete: "cascade" }),
    baseModelId: text("base_model_id").notNull(),
    backdrop: text("backdrop").notNull(),
    variations: integer("variations").notNull().default(2),
    provider: text("provider"),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    statusMessage: text("status_message"),
    creditsCharged: integer("credits_charged").notNull().default(0),
    creditsRefunded: integer("credits_refunded").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    error: text("error"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("jobs_status_idx").on(t.status),
    uniqueIndex("jobs_idempotency_idx").on(t.tenantId, t.idempotencyKey),
  ],
);

export type GateVerdict = {
  pass: boolean;
  score: number; // 0..1
  reasons: string[];
  checks: Record<string, boolean>;
};

export const generatedImages = pgTable(
  "generated_images",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    garmentId: text("garment_id")
      .notNull()
      .references(() => garments.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    provider: text("provider").notNull(),
    seed: integer("seed"),
    qualityScore: real("quality_score"),
    gateVerdict: jsonb("gate_verdict").$type<GateVerdict | null>(),
    accepted: boolean("accepted").notNull().default(false),
    provenance: jsonb("provenance").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("images_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("images_garment_idx").on(t.garmentId),
    index("images_job_idx").on(t.jobId),
  ],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(), // purchase | generation | refund | trial | adjustment
    jobId: text("job_id"),
    paymentId: text("payment_id"),
    balanceAfter: integer("balance_after").notNull(),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ledger_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // razorpay | stripe | manual
    providerRef: text("provider_ref"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    credits: integer("credits").notNull(),
    status: text("status").notNull().default("created"), // created | paid | failed | refunded
    invoiceUrl: text("invoice_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    uniqueIndex("payments_provider_ref_idx").on(t.provider, t.providerRef),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // image | garment | reel
    targetId: text("target_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("share_tenant_idx").on(t.tenantId)],
);

/* ------------------------------------------------------------------ */
/* Reels: scene stills from one hero image, animated and assembled.     */
/* ------------------------------------------------------------------ */

export type ReelVibe = "everyday" | "festive" | "editorial";

export type ReelStatus =
  | "queued"
  | "stills"
  | "selecting"
  | "animating"
  | "assembling"
  | "completed"
  | "partially_completed"
  | "failed";

export const reelJobs = pgTable(
  "reel_jobs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    garmentId: text("garment_id")
      .notNull()
      .references(() => garments.id, { onDelete: "cascade" }),
    /** The finished on-model image the stills are drawn from. */
    sourceImageId: text("source_image_id")
      .notNull()
      .references(() => generatedImages.id, { onDelete: "cascade" }),
    vibe: text("vibe").$type<ReelVibe>().notNull(),
    status: text("status").$type<ReelStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    statusMessage: text("status_message"),
    creditsCharged: integer("credits_charged").notNull().default(0),
    creditsRefunded: integer("credits_refunded").notNull().default(0),
    /** Still asset ids in playback order, set when the owner confirms. */
    selectedStillIds: jsonb("selected_still_ids").$type<string[] | null>(),
    /** Optional text burned into the reel (garment title, price). */
    caption: text("caption"),
    outputKey: text("output_key"),
    coverKey: text("cover_key"),
    durationSec: real("duration_sec"),
    error: text("error"),
    /** Dedupes the start request (double tap, flaky network). */
    idempotencyKey: text("idempotency_key"),
    /** Dedupes the confirm request. */
    confirmKey: text("confirm_key"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("reels_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("reels_garment_idx").on(t.garmentId),
    index("reels_status_idx").on(t.status),
    uniqueIndex("reels_idempotency_idx").on(t.tenantId, t.idempotencyKey),
  ],
);

export type ReelAssetKind = "still" | "clip";
export type ReelShotType = "wide-hook" | "full-body" | "movement" | "detail" | "hero-portrait";

export const reelAssets = pgTable(
  "reel_assets",
  {
    id: text("id").primaryKey(),
    reelJobId: text("reel_job_id")
      .notNull()
      .references(() => reelJobs.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ReelAssetKind>().notNull(),
    storageKey: text("storage_key").notNull(),
    thumbKey: text("thumb_key"),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    durationSec: real("duration_sec"),
    sceneLabel: text("scene_label").notNull(),
    shotType: text("shot_type").$type<ReelShotType>().notNull(),
    /** The scene prompt for a still; the motion prompt for a clip. */
    prompt: text("prompt").notNull(),
    provider: text("provider").notNull(),
    gateVerdict: jsonb("gate_verdict").$type<GateVerdict | null>(),
    /** For a clip: the still it was animated from. */
    sourceAssetId: text("source_asset_id"),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reel_assets_reel_idx").on(t.reelJobId), index("reel_assets_tenant_idx").on(t.tenantId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_created_idx").on(t.tenantId, t.createdAt)],
);

/** Platform-wide switches (provider kill switches, traffic split). One row per key. */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/* Relations (used by the relational query API) */
export const garmentRelations = relations(garments, ({ many }) => ({
  images: many(generatedImages),
  jobs: many(generationJobs),
}));
export const jobRelations = relations(generationJobs, ({ one, many }) => ({
  garment: one(garments, { fields: [generationJobs.garmentId], references: [garments.id] }),
  images: many(generatedImages),
}));
export const imageRelations = relations(generatedImages, ({ one }) => ({
  job: one(generationJobs, { fields: [generatedImages.jobId], references: [generationJobs.id] }),
  garment: one(garments, { fields: [generatedImages.garmentId], references: [garments.id] }),
}));

export const reelRelations = relations(reelJobs, ({ one, many }) => ({
  garment: one(garments, { fields: [reelJobs.garmentId], references: [garments.id] }),
  sourceImage: one(generatedImages, { fields: [reelJobs.sourceImageId], references: [generatedImages.id] }),
  assets: many(reelAssets),
}));
export const reelAssetRelations = relations(reelAssets, ({ one }) => ({
  reel: one(reelJobs, { fields: [reelAssets.reelJobId], references: [reelJobs.id] }),
}));

export type Garment = typeof garments.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type GeneratedImage = typeof generatedImages.$inferSelect;
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type ReelJob = typeof reelJobs.$inferSelect;
export type ReelAsset = typeof reelAssets.$inferSelect;
