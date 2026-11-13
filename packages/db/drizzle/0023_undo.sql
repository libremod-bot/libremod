ALTER TABLE "dashboard_audit" ADD COLUMN "before" jsonb;--> statement-breakpoint
ALTER TABLE "dashboard_audit" ADD COLUMN "after" jsonb;--> statement-breakpoint
ALTER TABLE "dashboard_audit" ADD COLUMN "undone_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dashboard_audit" ADD COLUMN "undone_by" varchar(100);