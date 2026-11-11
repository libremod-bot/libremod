CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"number" integer NOT NULL,
	"text" varchar(1000) NOT NULL,
	"author_id" varchar(32),
	"author_name" varchar(80),
	"saved_by" varchar(32) NOT NULL,
	"channel_id" varchar(32),
	"message_id" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_roles" (
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	CONSTRAINT "voice_roles_guild_id_channel_id_role_id_pk" PRIMARY KEY("guild_id","channel_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "word_chain_channels" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"last_word" varchar(40),
	"last_user_id" varchar(32),
	"length" integer DEFAULT 0 NOT NULL,
	"record" integer DEFAULT 0 NOT NULL,
	"allow_same_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_chain_words" (
	"channel_id" varchar(32) NOT NULL,
	"word" varchar(40) NOT NULL,
	CONSTRAINT "word_chain_words_channel_id_word_pk" PRIMARY KEY("channel_id","word")
);
--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "welcome_image" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "welcome_image_title" varchar(40) DEFAULT 'Willkommen!' NOT NULL;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD COLUMN "welcome_image_color" integer DEFAULT 5027071 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_guild_number" ON "quotes" USING btree ("guild_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_guild_message" ON "quotes" USING btree ("guild_id","message_id");