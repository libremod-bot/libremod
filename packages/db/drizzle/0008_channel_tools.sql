CREATE TABLE "auto_purge_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"interval_hours" integer NOT NULL,
	"keep_pinned" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_deleted" integer
);
--> statement-breakpoint
CREATE TABLE "auto_slowmode_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"messages_per_minute" integer DEFAULT 20 NOT NULL,
	"min_seconds" integer DEFAULT 0 NOT NULL,
	"max_seconds" integer DEFAULT 30 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlight_posts" (
	"message_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"highlight_message_id" varchar(32),
	"highlight_channel_id" varchar(32),
	"count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "highlight_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(32),
	"emoji" varchar(64) DEFAULT '⭐' NOT NULL,
	"threshold" integer DEFAULT 5 NOT NULL,
	"count_self" boolean DEFAULT false NOT NULL,
	"allow_nsfw" boolean DEFAULT false NOT NULL
);
