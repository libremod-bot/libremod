CREATE TYPE "public"."ticket_mode" AS ENUM('channel', 'thread');--> statement-breakpoint
CREATE TYPE "public"."ticket_panel_style" AS ENUM('buttons', 'select');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "ticket_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name" varchar(80) NOT NULL,
	"emoji" varchar(64),
	"description" varchar(100) DEFAULT '' NOT NULL,
	"mode" "ticket_mode" DEFAULT 'channel' NOT NULL,
	"parent_id" varchar(32),
	"staff_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ping_staff" boolean DEFAULT false NOT NULL,
	"welcome_message" text DEFAULT 'Hallo {user}, danke für dein Ticket! Das Team meldet sich so schnell wie möglich.' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_open" integer DEFAULT 1 NOT NULL,
	"name_template" varchar(100) DEFAULT 'ticket-{number}' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"title" varchar(256) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"color" integer DEFAULT 5027071 NOT NULL,
	"style" "ticket_panel_style" DEFAULT 'buttons' NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"log_channel_id" varchar(32),
	"transcript_dm" boolean DEFAULT true NOT NULL,
	"rating_enabled" boolean DEFAULT true NOT NULL,
	"owner_can_close" boolean DEFAULT true NOT NULL,
	"auto_close_hours" integer DEFAULT 0 NOT NULL,
	"blocked_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"number" integer NOT NULL,
	"category_id" integer,
	"category_name" varchar(80) NOT NULL,
	"channel_id" varchar(32),
	"owner_id" varchar(32) NOT NULL,
	"claimed_by" varchar(32),
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" varchar(32),
	"close_reason" varchar(500),
	"message_count" integer DEFAULT 0 NOT NULL,
	"rating" integer,
	"transcript" text
);
--> statement-breakpoint
CREATE INDEX "ticket_categories_guild" ON "ticket_categories" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_guild_number" ON "tickets" USING btree ("guild_id","number");--> statement-breakpoint
CREATE INDEX "tickets_channel" ON "tickets" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "tickets_open" ON "tickets" USING btree ("guild_id","status");