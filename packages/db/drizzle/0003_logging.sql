CREATE TYPE "public"."log_category" AS ENUM('messages', 'members', 'member_updates', 'server', 'voice');--> statement-breakpoint
CREATE TABLE "log_channels" (
	"guild_id" varchar(32) NOT NULL,
	"category" "log_category" NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	CONSTRAINT "log_channels_guild_id_category_pk" PRIMARY KEY("guild_id","category")
);
--> statement-breakpoint
CREATE TABLE "log_ignored_channels" (
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	CONSTRAINT "log_ignored_channels_guild_id_channel_id_pk" PRIMARY KEY("guild_id","channel_id")
);
