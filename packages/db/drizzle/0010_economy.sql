CREATE TABLE "economy_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "economy_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"currency_name" varchar(32) DEFAULT 'Münzen' NOT NULL,
	"currency_symbol" varchar(64) DEFAULT '🪙' NOT NULL,
	"start_balance" integer DEFAULT 0 NOT NULL,
	"daily_amount" integer DEFAULT 100 NOT NULL,
	"daily_streak_bonus" integer DEFAULT 10 NOT NULL,
	"work_min" integer DEFAULT 20 NOT NULL,
	"work_max" integer DEFAULT 60 NOT NULL,
	"work_cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"chat_reward" integer DEFAULT 0 NOT NULL,
	"allow_pay" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_balances" (
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"earned" integer DEFAULT 0 NOT NULL,
	"last_daily_at" timestamp with time zone,
	"daily_streak" integer DEFAULT 0 NOT NULL,
	"last_work_at" timestamp with time zone,
	CONSTRAINT "member_balances_guild_id_user_id_pk" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"item_id" integer,
	"item_name" varchar(60) NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(200) DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"role_id" varchar(32),
	"stock" integer,
	"reply_message" varchar(500) DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "economy_log_guild" ON "economy_log" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "member_balances_ranking" ON "member_balances" USING btree ("guild_id","balance");--> statement-breakpoint
CREATE INDEX "purchases_member" ON "purchases" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "shop_items_guild" ON "shop_items" USING btree ("guild_id");