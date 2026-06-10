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
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema/index.js';
// ESM-compatible __dirname.
// tsx with "module": "NodeNext" treats .ts files with import/export as ESM,
// where __dirname is not defined. fileURLToPath(import.meta.url) is the
// correct ESM equivalent. All static imports above are hoisted by the ESM
// runtime before this line executes, so dotenv loads before DATABASE_URL is read.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// seed.ts is at packages/db/src/ — three levels up reaches the monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
}
const queryClient = postgres(process.env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Automatically parse dates
    types: {
        date: {
            to: 1082,
            from: [1082],
            serialize: (date) => date.toISOString().split('T')[0],
            parse: (str) => new Date(str),
        },
    },
});
export const db = drizzle(queryClient, { schema });
// Re-export schema for convenience
export * from './schema/index.js';
//# sourceMappingURL=client.js.map