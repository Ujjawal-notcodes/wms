/**
 * @fileoverview Environment loader — MUST be the first import in env.ts.
 *
 * WHY THIS FILE EXISTS:
 * In ESM, static `import` declarations are hoisted and evaluated before any
 * module body code runs. Calling dotenv.config() in index.ts body is therefore
 * too late — env.ts has already been evaluated and parseEnv() has already
 * read process.env (and found nothing).
 *
 * The correct fix is to make dotenv.config() a module-level side effect of
 * a leaf module that env.ts depends on. ESM evaluates the dependency graph
 * depth-first, so this file runs before env.ts body executes.
 *
 * Resolution:  apps/api/src/config/load-env.ts
 *               → __dirname = apps/api/src/config/
 *               → ../../../.env = wms/.env  ✓
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })
