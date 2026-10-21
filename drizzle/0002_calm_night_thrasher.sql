CREATE TABLE "reel_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"reel_job_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_sec" real,
	"scene_label" text NOT NULL,
	"shot_type" text NOT NULL,
	"prompt" text NOT NULL,
	"provider" text NOT NULL,
	"gate_verdict" jsonb,
	"source_asset_id" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reel_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"garment_id" text NOT NULL,
	"source_image_id" text NOT NULL,
	"vibe" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"status_message" text,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"credits_refunded" integer DEFAULT 0 NOT NULL,
	"selected_still_ids" jsonb,
	"caption" text,
	"output_key" text,
	"cover_key" text,
	"duration_sec" real,
	"error" text,
	"idempotency_key" text,
	"confirm_key" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "reel_assets" ADD CONSTRAINT "reel_assets_reel_job_id_reel_jobs_id_fk" FOREIGN KEY ("reel_job_id") REFERENCES "public"."reel_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reel_assets" ADD CONSTRAINT "reel_assets_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_garment_id_garments_id_fk" FOREIGN KEY ("garment_id") REFERENCES "public"."garments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_source_image_id_generated_images_id_fk" FOREIGN KEY ("source_image_id") REFERENCES "public"."generated_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reel_jobs" ADD CONSTRAINT "reel_jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reel_assets_reel_idx" ON "reel_assets" USING btree ("reel_job_id");--> statement-breakpoint
CREATE INDEX "reel_assets_tenant_idx" ON "reel_assets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reels_tenant_created_idx" ON "reel_jobs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "reels_garment_idx" ON "reel_jobs" USING btree ("garment_id");--> statement-breakpoint
CREATE INDEX "reels_status_idx" ON "reel_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "reels_idempotency_idx" ON "reel_jobs" USING btree ("tenant_id","idempotency_key");