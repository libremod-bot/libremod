CREATE TABLE "dashboard_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"user_name" varchar(100) NOT NULL,
	"area" varchar(32) NOT NULL,
	"action" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_team_access" (
	"guild_id" varchar(32) NOT NULL,
	"role_id" varchar(32) NOT NULL,
	"areas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_team_access_guild_id_role_id_pk" PRIMARY KEY("guild_id","role_id")
);
--> statement-breakpoint
CREATE INDEX "dashboard_audit_guild" ON "dashboard_audit" USING btree ("guild_id","created_at");