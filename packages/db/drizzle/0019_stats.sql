CREATE TABLE "stats_channels" (
	"guild_id" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_channels_guild_id_day_channel_id_pk" PRIMARY KEY("guild_id","day","channel_id")
);
--> statement-breakpoint
CREATE TABLE "stats_daily" (
	"guild_id" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"joins" integer DEFAULT 0 NOT NULL,
	"leaves" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"members" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_daily_guild_id_day_pk" PRIMARY KEY("guild_id","day")
);
--> statement-breakpoint
CREATE TABLE "stats_hours" (
	"guild_id" varchar(32) NOT NULL,
	"day" date NOT NULL,
	"hour" integer NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stats_hours_guild_id_day_hour_pk" PRIMARY KEY("guild_id","day","hour")
);
