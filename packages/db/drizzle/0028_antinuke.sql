ALTER TABLE "guild_settings" ADD COLUMN "antinuke_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "antinuke_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "antinuke_action" varchar(16) DEFAULT 'strip' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "antinuke_trusted" jsonb DEFAULT '[]'::jsonb NOT NULL;