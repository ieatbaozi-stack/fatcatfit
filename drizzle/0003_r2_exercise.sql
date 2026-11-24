CREATE TABLE "exercise" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"name_th" text,
	"search_terms" text,
	"track_type" text NOT NULL,
	"load_mode" text NOT NULL,
	"is_unilateral" boolean NOT NULL,
	"category" text NOT NULL,
	"equipment" text,
	"source_dataset" text,
	"source_ref" text,
	"license" text,
	"attribution" text,
	"met" double precision,
	"archived_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"client_updated_at" timestamp (3) with time zone NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	CONSTRAINT "exercise_name_check" CHECK (char_length("exercise"."name") BETWEEN 1 AND 60),
	CONSTRAINT "exercise_name_th_check" CHECK ("exercise"."name_th" IS NULL OR char_length("exercise"."name_th") BETWEEN 1 AND 60),
	CONSTRAINT "exercise_track_type_check" CHECK ("exercise"."track_type" IN ('weight_reps', 'reps_only', 'duration', 'distance_duration', 'weight_duration', 'incline_speed_duration')),
	CONSTRAINT "exercise_load_mode_check" CHECK ("exercise"."load_mode" IN ('external', 'bodyweight_plus', 'assisted')),
	CONSTRAINT "exercise_load_mode_track_check" CHECK ("exercise"."load_mode" = 'external' OR "exercise"."track_type" = 'weight_reps'),
	CONSTRAINT "exercise_category_check" CHECK ("exercise"."category" IN ('chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'full_body', 'cardio', 'sport', 'mobility', 'other')),
	CONSTRAINT "exercise_equipment_check" CHECK ("exercise"."equipment" IS NULL OR "exercise"."equipment" IN ('barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'band', 'bodyweight', 'other')),
	CONSTRAINT "exercise_catalog_fields_check" CHECK ("exercise"."owner_user_id" IS NOT NULL OR ("exercise"."name_th" IS NOT NULL AND "exercise"."source_dataset" IS NOT NULL AND "exercise"."source_ref" IS NOT NULL AND "exercise"."license" IS NOT NULL AND "exercise"."attribution" IS NOT NULL AND "exercise"."deleted_at" IS NULL)),
	CONSTRAINT "exercise_own_fields_check" CHECK ("exercise"."owner_user_id" IS NULL OR ("exercise"."source_dataset" IS NULL AND "exercise"."source_ref" IS NULL AND "exercise"."license" IS NULL AND "exercise"."attribution" IS NULL AND "exercise"."met" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_owner_user_id_updated_at_idx" ON "exercise" USING btree ("owner_user_id","updated_at");