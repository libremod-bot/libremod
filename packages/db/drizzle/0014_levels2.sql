CREATE TABLE "level_multipliers" (
	"guild_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"percent" integer NOT NULL,
	CONSTRAINT "level_multipliers_guild_id_role_id_pk" PRIMARY KEY("guild_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "level_seasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"number" integer NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"top" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "weekend_percent" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "level_up_coins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "card_color" integer DEFAULT 5027071 NOT NULL;--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "season_mode" varchar(16) DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "season_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "level_settings" ADD COLUMN "season_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "level_seasons_guild_number" ON "level_seasons" USING btree ("guild_id","number");