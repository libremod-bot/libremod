CREATE TYPE "public"."event_state" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('yes', 'maybe', 'no', 'waitlist');--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"event_id" integer NOT NULL,
	"user_id" varchar(32) NOT NULL,
	"status" "rsvp_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvps_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"title" varchar(100) NOT NULL,
	"description" varchar(2000) DEFAULT '' NOT NULL,
	"location" varchar(200) DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slots" integer DEFAULT 0 NOT NULL,
	"host_id" varchar(32) NOT NULL,
	"role_id" varchar(32),
	"remind_minutes" integer DEFAULT 30 NOT NULL,
	"reminded" boolean DEFAULT false NOT NULL,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"state" "event_state" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_guild_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."guild_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_rsvps_status" ON "event_rsvps" USING btree ("event_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "guild_events_due" ON "guild_events" USING btree ("state","starts_at");--> statement-breakpoint
CREATE INDEX "guild_events_guild" ON "guild_events" USING btree ("guild_id");