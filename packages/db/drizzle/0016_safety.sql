ALTER TYPE "public"."automod_filter" ADD VALUE 'phishing';--> statement-breakpoint
CREATE TABLE "appeal_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(32),
	"question" varchar(300) DEFAULT 'Warum sollten wir deinen Ban aufheben?' NOT NULL,
	"cooldown_days" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ban_appeals" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"text" varchar(2000) NOT NULL,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"reviewer_id" varchar(32),
	"review_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "name_guard_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"action" varchar(16) DEFAULT 'rename' NOT NULL,
	"role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"names" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ban_appeals_one_open" ON "ban_appeals" USING btree ("guild_id","user_id") WHERE status = 'open';--> statement-breakpoint
CREATE INDEX "ban_appeals_guild" ON "ban_appeals" USING btree ("guild_id","created_at");