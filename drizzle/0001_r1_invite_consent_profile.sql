CREATE TABLE "invite_code" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"label" text NOT NULL,
	"max_uses" integer NOT NULL,
	"uses_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"revoked_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "invite_code_max_uses_check" CHECK ("invite_code"."max_uses" >= 1),
	CONSTRAINT "invite_code_uses_count_check" CHECK ("invite_code"."uses_count" >= 0 AND "invite_code"."uses_count" <= "invite_code"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "auth_throttle" (
	"key" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp (3) with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "auth_throttle_count_check" CHECK ("auth_throttle"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "body_entry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"measured_at" timestamp (3) with time zone NOT NULL,
	"local_date" date NOT NULL,
	"weight_kg" double precision NOT NULL,
	"weight_input" double precision NOT NULL,
	"weight_unit" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "body_entry_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "body_entry_weight_unit_check" CHECK ("body_entry"."weight_unit" IN ('kg', 'lb'))
);
--> statement-breakpoint
CREATE TABLE "consent_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"notice_version" text NOT NULL,
	"accepted_at" timestamp (3) with time zone NOT NULL,
	"locale" text NOT NULL,
	CONSTRAINT "consent_record_user_version_unique" UNIQUE("user_id","notice_version"),
	CONSTRAINT "consent_record_locale_check" CHECK ("consent_record"."locale" IN ('th', 'en'))
);
--> statement-breakpoint
CREATE TABLE "place" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp (3) with time zone,
	"archived_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "place_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"user_id" uuid NOT NULL,
	"locale" text NOT NULL,
	"weight_unit" text NOT NULL,
	"length_unit" text NOT NULL,
	"distance_unit" text NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"rest_seconds" integer DEFAULT 90 NOT NULL,
	"birth_year" integer NOT NULL,
	"height_m" double precision NOT NULL,
	"height_input" double precision NOT NULL,
	"height_unit" text NOT NULL,
	"goals" text NOT NULL,
	"experience" text,
	"onboarded_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "profile_pkey" PRIMARY KEY("user_id"),
	CONSTRAINT "profile_locale_check" CHECK ("profile"."locale" IN ('th', 'en')),
	CONSTRAINT "profile_weight_unit_check" CHECK ("profile"."weight_unit" IN ('kg', 'lb')),
	CONSTRAINT "profile_length_unit_check" CHECK ("profile"."length_unit" IN ('cm', 'in')),
	CONSTRAINT "profile_distance_unit_check" CHECK ("profile"."distance_unit" IN ('km', 'mi')),
	CONSTRAINT "profile_height_unit_check" CHECK ("profile"."height_unit" IN ('cm', 'in')),
	CONSTRAINT "profile_theme_check" CHECK ("profile"."theme" IN ('system', 'light', 'dark')),
	CONSTRAINT "profile_experience_check" CHECK ("profile"."experience" IS NULL OR "profile"."experience" IN ('new', 'some', 'regular')),
	CONSTRAINT "profile_rest_seconds_check" CHECK ("profile"."rest_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "invite_code_id" uuid;--> statement-breakpoint
ALTER TABLE "body_entry" ADD CONSTRAINT "body_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place" ADD CONSTRAINT "place_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_code_code_hash_unique" ON "invite_code" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "invite_code_expires_at_idx" ON "invite_code" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_throttle_expires_at_idx" ON "auth_throttle" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "body_entry_user_id_updated_at_idx" ON "body_entry" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "body_entry_user_id_local_date_idx" ON "body_entry" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "place_user_id_updated_at_idx" ON "place" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_invite_code_id_invite_code_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_code"("id") ON DELETE set null ON UPDATE no action;