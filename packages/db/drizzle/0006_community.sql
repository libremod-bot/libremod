CREATE TYPE "public"."schedule_kind" AS ENUM('interval', 'daily', 'weekly');--> statement-breakpoint
CREATE TABLE "counter_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"template" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_commands" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name" varchar(32) NOT NULL,
	"description" varchar(100) NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embed" boolean DEFAULT false NOT NULL,
	"embed_title" varchar(256),
	"embed_color" integer,
	"ephemeral" boolean DEFAULT false NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"content" text NOT NULL,
	"embed" boolean DEFAULT false NOT NULL,
	"embed_title" varchar(256),
	"kind" "schedule_kind" NOT NULL,
	"interval_minutes" integer,
	"time_of_day" varchar(5),
	"weekday" integer,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "temp_voice_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"owner_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_voice_hubs" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name_template" varchar(100) DEFAULT 'Kanal von {username}' NOT NULL,
	"user_limit" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_commands_guild_name" ON "custom_commands" USING btree ("guild_id","name");--> statement-breakpoint
CREATE INDEX "scheduled_due" ON "scheduled_messages" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "scheduled_guild" ON "scheduled_messages" USING btree ("guild_id");