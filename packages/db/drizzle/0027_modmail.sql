CREATE TABLE "modmail_settings" (
	"guild_id" varchar(32) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" varchar(32),
	"ping_role_id" varchar(32),
	"greeting" varchar(1000) DEFAULT 'Danke für deine Nachricht! Das Team meldet sich hier, sobald jemand Zeit hat.' NOT NULL,
	"closing" varchar(1000) DEFAULT 'Das Gespräch wurde geschlossen. Schreib einfach wieder, wenn du noch etwas brauchst.' NOT NULL,
	"show_staff_names" boolean DEFAULT false NOT NULL,
	"blocked_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modmail_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"thread_id" varchar(32) NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" varchar(32)
);
--> statement-breakpoint
CREATE INDEX "modmail_threads_user" ON "modmail_threads" USING btree ("user_id","open");--> statement-breakpoint
CREATE UNIQUE INDEX "modmail_threads_thread" ON "modmail_threads" USING btree ("thread_id");