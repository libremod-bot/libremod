CREATE TYPE "public"."case_type" AS ENUM('warn', 'timeout', 'untimeout', 'kick', 'ban', 'unban');--> statement-breakpoint
CREATE TYPE "public"."escalation_action" AS ENUM('timeout', 'kick', 'ban');--> statement-breakpoint
CREATE TABLE "mod_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"case_number" integer NOT NULL,
	"type" "case_type" NOT NULL,
	"target_id" varchar(32) NOT NULL,
	"moderator_id" varchar(32) NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warn_escalations" (
	"guild_id" varchar(32) NOT NULL,
	"warn_count" integer NOT NULL,
	"action" "escalation_action" NOT NULL,
	"duration_seconds" integer,
	CONSTRAINT "warn_escalations_guild_id_warn_count_pk" PRIMARY KEY("guild_id","warn_count")
);
--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "case_counter" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD COLUMN "dm_on_action" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_cases_guild_number" ON "mod_cases" USING btree ("guild_id","case_number");--> statement-breakpoint
CREATE INDEX "mod_cases_guild_target" ON "mod_cases" USING btree ("guild_id","target_id");--> statement-breakpoint
CREATE INDEX "mod_cases_expiring" ON "mod_cases" USING btree ("type","active","expires_at");