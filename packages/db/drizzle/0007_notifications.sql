CREATE TYPE "public"."notify_platform" AS ENUM('youtube', 'twitch', 'kick', 'reddit', 'rss');--> statement-breakpoint
CREATE TABLE "notification_feeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"platform" "notify_platform" NOT NULL,
	"source_id" varchar(500) NOT NULL,
	"name" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"mention_role_id" varchar(32),
	"enabled" boolean DEFAULT true NOT NULL,
	"seen" jsonb,
	"last_stream_id" varchar(100),
	"live" boolean DEFAULT false NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_post_at" timestamp with time zone,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_error" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notification_guild" ON "notification_feeds" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "notification_source" ON "notification_feeds" USING btree ("platform","source_id");