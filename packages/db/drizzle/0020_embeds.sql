ALTER TABLE "custom_commands" ADD COLUMN "design" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD COLUMN "design" jsonb;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "welcome_design" jsonb;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "goodbye_design" jsonb;