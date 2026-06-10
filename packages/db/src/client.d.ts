/**
 * @fileoverview Database client singleton.
 *
 * Creates a single postgres connection pool shared across the process.
 * Import `db` in any service or route handler.
 *
 * Connection pool settings:
 *   max: 10 connections (suitable for 3-5 concurrent users)
 *   idle_timeout: 20s — release idle connections
 *   connect_timeout: 10s — fail fast on DB unreachable
 */
import postgres from 'postgres';
import * as schema from './schema/index.js';
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema> & {
    $client: postgres.Sql<{
        date: Date;
    }>;
};
export type DbClient = typeof db;
export * from './schema/index.js';
