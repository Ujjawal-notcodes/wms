CREATE TYPE "public"."import_status" AS ENUM('pending', 'validating', 'validated', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_type" AS ENUM('location', 'sku', 'opening_stock');--> statement-breakpoint
CREATE TABLE "import_job_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"row_data" jsonb NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "import_type" NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"file_name" text,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"valid_rows" integer DEFAULT 0 NOT NULL,
	"error_rows" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."transfer_status";--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('draft', 'approved', 'in_transit', 'received', 'cancelled');--> statement-breakpoint
ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."transfer_status";--> statement-breakpoint
ALTER TABLE "transfer_orders" ALTER COLUMN "status" SET DATA TYPE "public"."transfer_status" USING "status"::"public"."transfer_status";--> statement-breakpoint
ALTER TABLE "import_job_rows" ADD CONSTRAINT "import_job_rows_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_import_job_rows_job_id" ON "import_job_rows" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_import_job_rows_is_valid" ON "import_job_rows" USING btree ("is_valid");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_org_id" ON "import_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_status" ON "import_jobs" USING btree ("status");