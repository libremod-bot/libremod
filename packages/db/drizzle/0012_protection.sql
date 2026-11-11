CREATE TYPE "public"."verification_mode" AS ENUM('button', 'code', 'question');--> statement-breakpoint
CREATE TABLE "channel_locks" (
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"previous" jsonb NOT NULL,
	"locked_by" varchar(32) NOT NULL,
	"reason" varchar(500),
	"server_wide" boolean DEFAULT false NOT NULL,
	"until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_locks_guild_id_channel_id_pk" PRIMARY KEY("guild_id","channel_id")
);
--> statement-breakpoint
CREATE TABLE "member_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"author_id" varchar(32) NOT NULL,
	"text" varchar(1000) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_pending" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_pending_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "verification_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"mode" "verification_mode" DEFAULT 'button' NOT NULL,
	"role_id" varchar(32),
	"unverified_role_id" varchar(32),
	"channel_id" varchar(32),
	"message_id" varchar(32),
	"title" varchar(256) DEFAULT 'Willkommen! Bitte kurz bestätigen' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"question" varchar(45) DEFAULT '' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_account_age_days" integer DEFAULT 0 NOT NULL,
	"kick_after_hours" integer DEFAULT 0 NOT NULL,
	"log_channel_id" varchar(32)
);
--> statement-breakpoint
CREATE INDEX "channel_locks_until" ON "channel_locks" USING btree ("until");--> statement-breakpoint
CREATE INDEX "member_notes_user" ON "member_notes" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "verification_pending_joined" ON "verification_pending" USING btree ("joined_at");