CREATE TYPE "public"."auto_role_target" AS ENUM('humans', 'bots');--> statement-breakpoint
CREATE TYPE "public"."role_panel_style" AS ENUM('buttons', 'select');--> statement-breakpoint
CREATE TABLE "auto_roles" (
	"guild_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"target" "auto_role_target" DEFAULT 'humans' NOT NULL,
	CONSTRAINT "auto_roles_guild_id_role_id_target_pk" PRIMARY KEY("guild_id","role_id","target")
);
--> statement-breakpoint
CREATE TABLE "role_panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"title" varchar(256) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"style" "role_panel_style" DEFAULT 'buttons' NOT NULL,
	"single" boolean DEFAULT false NOT NULL,
	"role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcome_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"welcome_enabled" boolean DEFAULT false NOT NULL,
	"welcome_channel_id" varchar(32),
	"welcome_message" text DEFAULT 'Willkommen auf **{server}**, {user}! Du bist Mitglied Nummer {membercount}.' NOT NULL,
	"welcome_embed" boolean DEFAULT true NOT NULL,
	"dm_enabled" boolean DEFAULT false NOT NULL,
	"dm_message" text DEFAULT 'Hallo {username}, schön, dass du auf **{server}** bist!' NOT NULL,
	"goodbye_enabled" boolean DEFAULT false NOT NULL,
	"goodbye_channel_id" varchar(32),
	"goodbye_message" text DEFAULT '**{username}** hat den Server verlassen.' NOT NULL,
	"goodbye_embed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "role_panels_guild" ON "role_panels" USING btree ("guild_id");