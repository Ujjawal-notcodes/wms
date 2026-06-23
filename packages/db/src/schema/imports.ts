/**
 * @fileoverview Imports schema.
 * Tracks import jobs and import job rows for validation/execution staging.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { importTypeEnum, importStatusEnum } from './enums.js'
import { organizations } from './organizations.js'
import { users } from './auth.js'

// ─────────────────────────────────────────────────────────────
// Import Jobs
// ─────────────────────────────────────────────────────────────

export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    type: importTypeEnum('type').notNull(),
    status: importStatusEnum('status').notNull().default('pending'),
    fileName: text('file_name'),
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_jobs_org_id').on(table.orgId),
    index('idx_import_jobs_status').on(table.status),
  ],
)

export type ImportJob = typeof importJobs.$inferSelect
export type NewImportJob = typeof importJobs.$inferInsert

// ─────────────────────────────────────────────────────────────
// Import Job Rows (Staging Area)
// ─────────────────────────────────────────────────────────────

export const importJobRows = pgTable(
  'import_job_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rowData: jsonb('row_data').notNull(), // Raw JSON row from Excel
    isValid: boolean('is_valid').notNull().default(true),
    errors: jsonb('errors').$type<string[]>().notNull().default([]), // List of validation errors for this row
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_job_rows_job_id').on(table.jobId),
    index('idx_import_job_rows_is_valid').on(table.isValid),
  ],
)

export type ImportJobRow = typeof importJobRows.$inferSelect
export type NewImportJobRow = typeof importJobRows.$inferInsert

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const importJobsRelations = relations(importJobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [importJobs.orgId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [importJobs.createdBy],
    references: [users.id],
  }),
  rows: many(importJobRows),
}))

export const importJobRowsRelations = relations(importJobRows, ({ one }) => ({
  job: one(importJobs, {
    fields: [importJobRows.jobId],
    references: [importJobs.id],
  }),
}))
