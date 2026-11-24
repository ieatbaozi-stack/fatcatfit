CREATE TABLE "session_exercise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"exercise_name" text NOT NULL,
	"exercise_name_th" text,
	"track_type" text NOT NULL,
	"load_mode" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "session_exercise_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "session_exercise_position_check" CHECK ("session_exercise"."position" BETWEEN 0 AND 1000),
	CONSTRAINT "session_exercise_name_check" CHECK (char_length("session_exercise"."exercise_name") BETWEEN 1 AND 60),
	CONSTRAINT "session_exercise_track_type_check" CHECK ("session_exercise"."track_type" IN ('weight_reps', 'reps_only', 'duration', 'distance_duration', 'weight_duration', 'incline_speed_duration')),
	CONSTRAINT "session_exercise_load_mode_check" CHECK ("session_exercise"."load_mode" IN ('external', 'bodyweight_plus', 'assisted')),
	CONSTRAINT "session_exercise_load_mode_track_check" CHECK ("session_exercise"."load_mode" = 'external' OR "session_exercise"."track_type" = 'weight_reps')
);
--> statement-breakpoint
CREATE TABLE "set_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"set_kind" text NOT NULL,
	"completed_at" timestamp (3) with time zone NOT NULL,
	"weight_kg" double precision,
	"weight_input" double precision,
	"weight_unit" text,
	"reps" integer,
	"duration_s" integer,
	"distance_m" double precision,
	"distance_input" double precision,
	"distance_unit" text,
	"speed_mps" double precision,
	"speed_input" double precision,
	"speed_unit" text,
	"incline_pct" double precision,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "set_record_position_check" CHECK ("set_record"."position" BETWEEN 0 AND 1000),
	CONSTRAINT "set_record_set_kind_check" CHECK ("set_record"."set_kind" IN ('normal', 'warmup')),
	CONSTRAINT "set_record_weight_set_check" CHECK (("set_record"."weight_kg" IS NULL AND "set_record"."weight_input" IS NULL AND "set_record"."weight_unit" IS NULL) OR ("set_record"."weight_kg" IS NOT NULL AND "set_record"."weight_input" IS NOT NULL AND "set_record"."weight_unit" IS NOT NULL)),
	CONSTRAINT "set_record_distance_set_check" CHECK (("set_record"."distance_m" IS NULL AND "set_record"."distance_input" IS NULL AND "set_record"."distance_unit" IS NULL) OR ("set_record"."distance_m" IS NOT NULL AND "set_record"."distance_input" IS NOT NULL AND "set_record"."distance_unit" IS NOT NULL)),
	CONSTRAINT "set_record_speed_set_check" CHECK (("set_record"."speed_mps" IS NULL AND "set_record"."speed_input" IS NULL AND "set_record"."speed_unit" IS NULL) OR ("set_record"."speed_mps" IS NOT NULL AND "set_record"."speed_input" IS NOT NULL AND "set_record"."speed_unit" IS NOT NULL)),
	CONSTRAINT "set_record_weight_range_check" CHECK ("set_record"."weight_unit" IS NULL OR ("set_record"."weight_unit" = 'kg' AND "set_record"."weight_input" BETWEEN 0 AND 1000) OR ("set_record"."weight_unit" = 'lb' AND "set_record"."weight_input" BETWEEN 0 AND 2200)),
	CONSTRAINT "set_record_reps_check" CHECK ("set_record"."reps" IS NULL OR "set_record"."reps" BETWEEN 1 AND 1000),
	CONSTRAINT "set_record_duration_check" CHECK ("set_record"."duration_s" IS NULL OR "set_record"."duration_s" BETWEEN 1 AND 86400),
	CONSTRAINT "set_record_distance_range_check" CHECK ("set_record"."distance_unit" IS NULL OR ("set_record"."distance_unit" = 'km' AND "set_record"."distance_input" BETWEEN 0.01 AND 1000) OR ("set_record"."distance_unit" = 'mi' AND "set_record"."distance_input" BETWEEN 0.01 AND 620)),
	CONSTRAINT "set_record_speed_range_check" CHECK ("set_record"."speed_unit" IS NULL OR ("set_record"."speed_unit" = 'kmh' AND "set_record"."speed_input" BETWEEN 0.1 AND 40) OR ("set_record"."speed_unit" = 'mph' AND "set_record"."speed_input" BETWEEN 0.1 AND 25)),
	CONSTRAINT "set_record_incline_check" CHECK ("set_record"."incline_pct" IS NULL OR "set_record"."incline_pct" BETWEEN 0 AND 40)
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"started_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"local_date" date NOT NULL,
	"time_zone" text NOT NULL,
	"template_id" uuid,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "workout_session_id_user_id_unique" UNIQUE("id","user_id"),
	CONSTRAINT "workout_session_time_zone_check" CHECK (char_length("workout_session"."time_zone") BETWEEN 1 AND 64),
	CONSTRAINT "workout_session_span_check" CHECK ("workout_session"."ended_at" IS NULL OR ("workout_session"."ended_at" >= "workout_session"."started_at" AND "workout_session"."ended_at" <= "workout_session"."started_at" + interval '24 hours'))
);
--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercise" ADD CONSTRAINT "session_exercise_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."workout_session"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_record" ADD CONSTRAINT "set_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_record" ADD CONSTRAINT "set_record_session_exercise_user_fk" FOREIGN KEY ("session_exercise_id","user_id") REFERENCES "public"."session_exercise"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_place_user_fk" FOREIGN KEY ("place_id","user_id") REFERENCES "public"."place"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_exercise_user_id_updated_at_idx" ON "session_exercise" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "session_exercise_user_id_exercise_id_idx" ON "session_exercise" USING btree ("user_id","exercise_id");--> statement-breakpoint
CREATE INDEX "session_exercise_session_id_idx" ON "session_exercise" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_record_user_id_updated_at_idx" ON "set_record" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "set_record_session_exercise_id_position_idx" ON "set_record" USING btree ("session_exercise_id","position");--> statement-breakpoint
CREATE INDEX "set_record_user_id_completed_at_idx" ON "set_record" USING btree ("user_id","completed_at");--> statement-breakpoint
CREATE INDEX "workout_session_user_id_updated_at_idx" ON "workout_session" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "workout_session_user_id_local_date_idx" ON "workout_session" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "workout_session_place_id_idx" ON "workout_session" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "workout_session_user_id_active_idx" ON "workout_session" USING btree ("user_id") WHERE "workout_session"."ended_at" IS NULL AND "workout_session"."deleted_at" IS NULL;