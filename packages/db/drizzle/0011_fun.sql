CREATE TABLE "birthday_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(32),
	"role_id" varchar(32),
	"message" text DEFAULT '🎉 Alles Gute zum Geburtstag, {user}!' NOT NULL,
	"hour" integer DEFAULT 9 NOT NULL,
	"last_run_date" varchar(10),
	"role_holders" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "birthdays" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"month" integer NOT NULL,
	"day" integer NOT NULL,
	"year" integer,
	CONSTRAINT "birthdays_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "giveaway_entries" (
	"giveaway_id" integer NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "giveaway_entries_giveaway_id_user_id_pk" PRIMARY KEY("giveaway_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "giveaways" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"prize" varchar(200) NOT NULL,
	"description" varchar(1000) DEFAULT '' NOT NULL,
	"winners" integer DEFAULT 1 NOT NULL,
	"host_id" varchar(32) NOT NULL,
	"required_role_id" varchar(32),
	"min_level" integer DEFAULT 0 NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"ended" boolean DEFAULT false NOT NULL,
	"winner_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"text" varchar(1000) NOT NULL,
	"dm" boolean DEFAULT false NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "birthdays_date" ON "birthdays" USING btree ("guild_id","month","day");--> statement-breakpoint
CREATE INDEX "giveaways_due" ON "giveaways" USING btree ("ended","ends_at");--> statement-breakpoint
CREATE INDEX "giveaways_guild" ON "giveaways" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "reminders_due" ON "reminders" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "reminders_user" ON "reminders" USING btree ("guild_id","user_id");