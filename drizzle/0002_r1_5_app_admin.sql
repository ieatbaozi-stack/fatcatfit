CREATE TABLE "app_admin" (
	"user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	CONSTRAINT "app_admin_pkey" PRIMARY KEY("user_id")
);
--> statement-breakpoint
ALTER TABLE "app_admin" ADD CONSTRAINT "app_admin_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;