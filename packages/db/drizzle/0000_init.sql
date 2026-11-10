CREATE TABLE "guild_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"locale" varchar(8) DEFAULT 'de' NOT NULL,
	"mod_log_channel_id" varchar(32),
	"automod_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
