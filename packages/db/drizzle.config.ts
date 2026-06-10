import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// drizzle.config.ts lives at packages/db/ (one level above src/).
// __dirname is not available in ESM. Use import.meta.url instead.
// drizzle-kit bundles this with esbuild (CJS mode) so __dirname would
// accidentally work there, but we use the correct ESM form for consistency.
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// drizzle.config.ts is at packages/db/ — two levels up reaches the monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[drizzle.config.ts] DATABASE_URL is undefined. ' +
    'Ensure a .env file exists at the monorepo root with DATABASE_URL set.'
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  verbose: true,
  strict: true,
})
