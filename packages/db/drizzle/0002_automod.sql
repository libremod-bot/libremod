CREATE TYPE "public"."automod_action" AS ENUM('delete', 'warn', 'timeout', 'kick', 'ban');--> statement-breakpoint
CREATE TYPE "public"."automod_filter" AS ENUM('spam', 'invites', 'links', 'words', 'caps', 'mentions');--> statement-breakpoint
CREATE TYPE "public"."exemption_kind" AS ENUM('role', 'channel');--> statement-breakpoint
CREATE TABLE "automod_exemptions" (
	"guild_id" varchar(32) NOT NULL,
	"kind" "exemption_kind" NOT NULL,
	"target_id" varchar(32) NOT NULL,
	CONSTRAINT "automod_exemptions_guild_id_kind_target_id_pk" PRIMARY KEY("guild_id","kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "automod_rules" (
	"guild_id" varchar(32) NOT NULL,
	"filter" "automod_filter" NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"action" "automod_action" DEFAULT 'delete' NOT NULL,
	"duration_seconds" integer,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "automod_rules_guild_id_filter_pk" PRIMARY KEY("guild_id","filter")
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "raid_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "raid_join_threshold" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "raid_window_seconds" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "raid_action" varchar(16) DEFAULT 'alert' NOT NULL;