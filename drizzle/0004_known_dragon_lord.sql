CREATE TABLE "app_content" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "backdrops" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hex" text NOT NULL,
	"kind" text DEFAULT 'studio' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_models" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"body_type" text NOT NULL,
	"skin_tone" text NOT NULL,
	"age_range" text NOT NULL,
	"pose" text DEFAULT 'front' NOT NULL,
	"image_key" text,
	"image_url" text,
	"width" integer DEFAULT 864 NOT NULL,
	"height" integer DEFAULT 1296 NOT NULL,
	"licence_note" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"credits" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reel_scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"vibe" text NOT NULL,
	"label" text NOT NULL,
	"shot_type" text NOT NULL,
	"prompt" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "backdrops_active_sort_idx" ON "backdrops" USING btree ("active","sort");--> statement-breakpoint
CREATE INDEX "base_models_active_sort_idx" ON "base_models" USING btree ("active","sort");--> statement-breakpoint
CREATE INDEX "credit_packs_active_sort_idx" ON "credit_packs" USING btree ("active","sort");--> statement-breakpoint
CREATE INDEX "reel_scenes_vibe_sort_idx" ON "reel_scenes" USING btree ("vibe","sort");--> statement-breakpoint
CREATE INDEX "jobs_tenant_status_idx" ON "generation_jobs" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "reels_tenant_status_idx" ON "reel_jobs" USING btree ("tenant_id","status");