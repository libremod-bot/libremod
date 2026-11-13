ALTER TABLE "instance_status" ADD COLUMN "latest_version" varchar(32) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "latest_url" varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "latest_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "updater_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "auto_update_hours" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "system_updates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_requested_by" varchar(32);--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_ok" boolean;--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_source" varchar(16);--> statement-breakpoint
ALTER TABLE "instance_status" ADD COLUMN "update_log" text;