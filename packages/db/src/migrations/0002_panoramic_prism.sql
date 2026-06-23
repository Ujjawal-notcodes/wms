ALTER TABLE "locations" ALTER COLUMN "level" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."location_level";--> statement-breakpoint
CREATE TYPE "public"."location_level" AS ENUM('site', 'building', 'floor', 'zone', 'row', 'column', 'shelf');--> statement-breakpoint
UPDATE "locations" SET "level" = 'zone' WHERE "level" = 'store';--> statement-breakpoint
UPDATE "locations" SET "level" = 'row' WHERE "level" = 'rack';--> statement-breakpoint
UPDATE "locations" SET "level" = 'column' WHERE "level" = 'bin';--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "level" SET DATA TYPE "public"."location_level" USING "level"::"public"."location_level";--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "deleted_at" timestamp with time zone;