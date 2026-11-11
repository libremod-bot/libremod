CREATE TYPE "public"."level_announce" AS ENUM('off', 'same', 'channel', 'dm');--> statement-breakpoint
CREATE TABLE "level_no_xp" (
	"guild_id" varchar(32) NOT NULL,
	"kind" "exemption_kind" NOT NULL,
	"target_id" varchar(32) NOT NULL,
	CONSTRAINT "level_no_xp_guild_id_kind_target_id_pk" PRIMARY KEY("guild_id","kind","target_id")
);
--> statement-breakpoint
CREATE TABLE "level_rewards" (
	"guild_id" varchar(32) NOT NULL,
	"level" integer NOT NULL,
	"role_id" varchar(32) NOT NULL,
	CONSTRAINT "level_rewards_guild_id_level_pk" PRIMARY KEY("guild_id","level")
);
--> statement-breakpoint
CREATE TABLE "level_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"text_xp_min" integer DEFAULT 15 NOT NULL,
	"text_xp_max" integer DEFAULT 25 NOT NULL,
	"cooldown_seconds" integer DEFAULT 60 NOT NULL,
	"voice_xp_per_minute" integer DEFAULT 10 NOT NULL,
	"announce" "level_announce" DEFAULT 'same' NOT NULL,
	"announce_channel_id" varchar(32),
	"announce_message" text DEFAULT 'Glückwunsch {user}, du bist jetzt **Level {level}**!' NOT NULL,
	"stack_rewards" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_xp" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"voice_minutes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_xp_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "member_xp_ranking" ON "member_xp" USING btree ("guild_id","xp");