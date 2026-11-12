CREATE TABLE "instance_status" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"version" varchar(32) DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"guilds" integer DEFAULT 0 NOT NULL,
	"ping_ms" integer DEFAULT 0 NOT NULL,
	"phishing_domains" integer DEFAULT 0 NOT NULL,
	"last_backup_at" timestamp with time zone,
	"last_backup_bytes" integer,
	"owner_ids" text[] DEFAULT '{}' NOT NULL
);
