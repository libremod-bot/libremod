CREATE TYPE "public"."suggestion_status" AS ENUM('open', 'considered', 'accepted', 'denied', 'implemented');--> statement-breakpoint
CREATE TABLE "counting_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"last_user_id" varchar(32),
	"record" integer DEFAULT 0 NOT NULL,
	"allow_same_user" boolean DEFAULT false NOT NULL,
	"reset_on_fail" boolean DEFAULT true NOT NULL,
	"only_numbers" boolean DEFAULT true NOT NULL,
	"fails" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(32),
	"auto_convert" boolean DEFAULT true NOT NULL,
	"threads" boolean DEFAULT false NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"dm_author" boolean DEFAULT true NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion_votes" (
	"suggestion_id" integer NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"vote" integer NOT NULL,
	CONSTRAINT "suggestion_votes_suggestion_id_user_id_pk" PRIMARY KEY("suggestion_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"number" integer NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"author_id" varchar(32) NOT NULL,
	"text" varchar(2000) NOT NULL,
	"status" "suggestion_status" DEFAULT 'open' NOT NULL,
	"status_reason" varchar(500),
	"status_by" varchar(32),
	"up" integer DEFAULT 0 NOT NULL,
	"down" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_roles" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"added_by" varchar(32),
	"source" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "temp_roles_guild_id_user_id_role_id_pk" PRIMARY KEY("guild_id","user_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "shop_items" ADD COLUMN "role_days" integer;--> statement-breakpoint
CREATE INDEX "counting_guild" ON "counting_channels" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suggestions_guild_number" ON "suggestions" USING btree ("guild_id","number");--> statement-breakpoint
CREATE INDEX "suggestions_guild_status" ON "suggestions" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "temp_roles_expires" ON "temp_roles" USING btree ("expires_at");