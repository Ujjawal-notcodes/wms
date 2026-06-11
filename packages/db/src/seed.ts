/**
 * @fileoverview Database seeder for Phase 1.
 *
 * Seeds:
 *   - 1 Organization (Acme Industrial)
 *   - 2 Sites (Factory, Warehouse)
 *   - Location tree for each site
 *   - 7 System Roles
 *   - All permissions (module × action matrix)
 *   - Role-permission mappings
 *   - 3 Seed users (admin, warehouse manager, factory manager)
 *   - 5 SKU Categories
 *   - 10 Sample SKUs
 *
 * Usage:
 *   pnpm db:seed
 *   Or: tsx src/seed.ts
 *
 * Run ONCE on fresh database after migration.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { fileURLToPath } from 'url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import bcrypt from 'bcryptjs'
import * as schema from './schema/index.js'
import { eq, and } from 'drizzle-orm'
import { dirname } from 'path'

// ESM-compatible __dirname replacement.
// tsx with "module": "NodeNext" treats .ts files with import/export as ESM.
// __dirname is a CommonJS global that does not exist in ESM.
// The correct ESM equivalent is fileURLToPath(import.meta.url).
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load root .env explicitly by absolute path so this works regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const DATABASE_URL = process.env.DATABASE_URL!
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@wms.local'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123'
const ORG_NAME = process.env.SEED_ORG_NAME ?? 'Acme Industrial'
const ORG_CODE = process.env.SEED_ORG_CODE ?? 'ACME'

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL is not set')
  process.exit(1)
}

const client = postgres(DATABASE_URL, { max: 1 })
const db = drizzle(client, { schema })

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION MATRIX
// ─────────────────────────────────────────────────────────────────────────────

const MODULES = [
  'skus',
  'categories',
  'locations',
  'sites',
  'inventory',
  'transfers',
  'users',
  'roles',
  'dashboard',
] as const

const ACTIONS = ['read', 'create', 'update', 'delete', 'approve', 'post'] as const

type Module = (typeof MODULES)[number]
type Action = (typeof ACTIONS)[number]

// Role → Map of module → allowed actions
const ROLE_PERMISSIONS: Record<string, Partial<Record<Module, Action[]>>> = {
  'Admin': {
    skus:       ['read', 'create', 'update', 'delete'],
    categories: ['read', 'create', 'update', 'delete'],
    locations:  ['read', 'create', 'update', 'delete'],
    sites:      ['read', 'create', 'update'],
    inventory:  ['read', 'create', 'approve', 'post'],
    transfers:  ['read', 'create', 'update', 'approve', 'post'],
    users:      ['read', 'create', 'update', 'delete'],
    roles:      ['read', 'create', 'update', 'delete'],
    dashboard:  ['read'],
  },
  'Warehouse Manager': {
    skus:       ['read', 'create', 'update'],
    categories: ['read'],
    locations:  ['read', 'create', 'update'],
    sites:      ['read'],
    inventory:  ['read', 'create', 'approve', 'post'],
    transfers:  ['read', 'create', 'update', 'approve', 'post'],
    users:      ['read'],
    roles:      ['read'],
    dashboard:  ['read'],
  },
  'Factory Manager': {
    skus:       ['read', 'create', 'update'],
    categories: ['read'],
    locations:  ['read', 'create', 'update'],
    sites:      ['read'],
    inventory:  ['read', 'create', 'approve', 'post'],
    transfers:  ['read', 'create', 'update', 'approve'],
    users:      ['read'],
    roles:      ['read'],
    dashboard:  ['read'],
  },
  'Warehouse Staff': {
    skus:       ['read'],
    categories: ['read'],
    locations:  ['read'],
    sites:      ['read'],
    inventory:  ['read'],
    transfers:  ['read', 'create'],
    dashboard:  ['read'],
  },
  'Factory Staff': {
    skus:       ['read'],
    categories: ['read'],
    locations:  ['read'],
    sites:      ['read'],
    inventory:  ['read'],
    transfers:  ['read'],
    dashboard:  ['read'],
  },
  'QC Inspector': {
    skus:       ['read'],
    locations:  ['read'],
    inventory:  ['read', 'approve'],
    dashboard:  ['read'],
  },
  'Viewer': {
    skus:       ['read'],
    categories: ['read'],
    locations:  ['read'],
    inventory:  ['read'],
    transfers:  ['read'],
    dashboard:  ['read'],
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION TREE HELPER
// ─────────────────────────────────────────────────────────────────────────────

interface LocationNode {
  code: string
  name: string
  level: schema.NewLocation['level']
  isStorage?: boolean
  children?: LocationNode[]
}

async function insertLocationTree(
  siteId: string,
  nodes: LocationNode[],
  parentId: string | null = null,
  parentPath: string = '',
): Promise<void> {
  for (const node of nodes) {
    const path = parentPath ? `${parentPath}/${node.code}` : node.code

    const [inserted] = await db
      .insert(schema.locations)
      .values({
        siteId,
        parentId: parentId ?? undefined,
        name: node.name,
        code: node.code,
        level: node.level,
        path,
        isStorage: node.isStorage ?? false,
      })
      .returning()

    if (node.children && inserted) {
      await insertLocationTree(siteId, node.children, inserted.id, path)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱  Starting database seed...\n')

  console.log('  Truncating locations, sites, and skus...')
  await client`TRUNCATE locations, sites, skus CASCADE;`

  // ── 1. Organization ──────────────────────────────────────────────────────

  console.log('  Creating organization...')
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: ORG_NAME, code: ORG_CODE })
    .onConflictDoNothing()
    .returning()

  const orgId = org?.id ?? (
    await db.query.organizations.findFirst({ where: eq(schema.organizations.code, ORG_CODE) })
  )!.id

  console.log(`  ✓ Organization: ${ORG_NAME} (${ORG_CODE})`)

  // ── 2. Sites ──────────────────────────────────────────────────────────────

  console.log('\n  Creating sites...')

  const [factory] = await db
    .insert(schema.sites)
    .values({ orgId, name: 'Main Factory', code: 'FAC', siteType: 'factory' })
    .onConflictDoNothing()
    .returning()

  const [warehouse] = await db
    .insert(schema.sites)
    .values({ orgId, name: 'Main Warehouse', code: 'WH', siteType: 'warehouse' })
    .onConflictDoNothing()
    .returning()

  const factoryId = factory?.id
    ?? (await db.query.sites.findFirst({ where: and(eq(schema.sites.orgId, orgId), eq(schema.sites.code, 'FAC')) }))!.id
  const warehouseId = warehouse?.id
    ?? (await db.query.sites.findFirst({ where: and(eq(schema.sites.orgId, orgId), eq(schema.sites.code, 'WH')) }))!.id

  console.log('  ✓ Factory site')
  console.log('  ✓ Warehouse site')

  // ── 3. Location Trees ─────────────────────────────────────────────────────

  console.log('\n  Creating Factory location tree...')

  const factoryLocations: LocationNode[] = [
    {
      code: 'RAW-STORE', name: 'Raw Materials Store', level: 'store',
      children: [
        {
          code: 'R-A', name: 'Zone A', level: 'floor',
          children: [
            {
              code: 'R-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'R-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'R-A-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
                { code: 'R-A-01-03', name: 'Bin 03', level: 'bin', isStorage: true },
              ],
            },
            {
              code: 'R-A-02', name: 'Rack 02', level: 'rack',
              children: [
                { code: 'R-A-02-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'R-A-02-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
        {
          code: 'R-B', name: 'Zone B', level: 'floor',
          children: [
            {
              code: 'R-B-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'R-B-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'R-B-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'COMP-STORE', name: 'Components Store', level: 'building',
      children: [
        {
          code: 'C-A', name: 'Zone A', level: 'floor',
          children: [
            {
              code: 'C-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'C-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'C-A-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'SEMI-FG', name: 'Semi-Finished Goods Buffer', level: 'building',
      children: [
        {
          code: 'S-A', name: 'Zone A', level: 'floor',
          children: [
            {
              code: 'S-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'S-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'S-A-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'PRODUCTION', name: 'Production Floor', level: 'building',
      children: [
        { code: 'P-A', name: 'Assembly Area', level: 'floor', isStorage: false },
      ],
    },
  ]

  await insertLocationTree(factoryId, factoryLocations)
  console.log('  ✓ Factory locations created')

  console.log('  Creating Warehouse location tree...')

  const warehouseLocations: LocationNode[] = [
    {
      code: 'FG-STORE', name: 'Finished Goods Store', level: 'store',
      children: [
        {
          code: 'F-A', name: 'Zone A', level: 'floor',
          children: [
            {
              code: 'F-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'F-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'F-A-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
                { code: 'F-A-01-03', name: 'Bin 03', level: 'bin', isStorage: true },
              ],
            },
            {
              code: 'F-A-02', name: 'Rack 02', level: 'rack',
              children: [
                { code: 'F-A-02-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'F-A-02-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
        {
          code: 'F-B', name: 'Zone B', level: 'floor',
          children: [
            {
              code: 'F-B-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'F-B-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'F-B-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'AMAZON', name: 'Amazon FBA Staging', level: 'building',
      children: [
        {
          code: 'AMZ-A', name: 'Staging Area A', level: 'floor',
          children: [
            {
              code: 'AMZ-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'AMZ-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
                { code: 'AMZ-A-01-02', name: 'Bin 02', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'EXPORT', name: 'Export Staging', level: 'building',
      children: [
        {
          code: 'EXP-A', name: 'Export Area A', level: 'floor',
          children: [
            {
              code: 'EXP-A-01', name: 'Rack 01', level: 'rack',
              children: [
                { code: 'EXP-A-01-01', name: 'Bin 01', level: 'bin', isStorage: true },
              ],
            },
          ],
        },
      ],
    },
    {
      code: 'PACKING', name: 'Packing Area', level: 'building',
      children: [
        { code: 'PKG-A', name: 'Packing Station A', level: 'floor', isStorage: false },
        { code: 'PKG-B', name: 'Packing Station B', level: 'floor', isStorage: false },
      ],
    },
    {
      code: 'DISPATCH', name: 'Dispatch Dock', level: 'building',
      children: [
        { code: 'DSP-A', name: 'Dock A', level: 'floor', isStorage: false },
        { code: 'DSP-B', name: 'Dock B', level: 'floor', isStorage: false },
      ],
    },
  ]

  await insertLocationTree(warehouseId, warehouseLocations)
  console.log('  ✓ Warehouse locations created')

  // ── 4. Roles ──────────────────────────────────────────────────────────────

  console.log('\n  Creating roles...')

  const roleNames = Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]
  const roleMap: Record<string, string> = {} // name → id

  for (const name of roleNames) {
    const [role] = await db
      .insert(schema.roles)
      .values({ orgId, name, isSystemRole: true })
      .onConflictDoNothing()
      .returning()

    const roleId = role?.id
      ?? (await db.query.roles.findFirst({ where: and(eq(schema.roles.orgId, orgId), eq(schema.roles.name, name)) }))!.id

    roleMap[name] = roleId
    console.log(`  ✓ Role: ${name}`)
  }

  // ── 5. Permissions & Role-Permission Mappings ─────────────────────────────

  console.log('\n  Creating permissions...')

  const permMap: Record<string, string> = {} // "module:action" → id

  for (const module of MODULES) {
    for (const action of ACTIONS) {
      const key = `${module}:${action}`
      const description = `${action.charAt(0).toUpperCase() + action.slice(1)} ${module}`

      const [perm] = await db
        .insert(schema.permissions)
        .values({ module, action, description })
        .onConflictDoNothing()
        .returning()

      const permId = perm?.id
        ?? (await db.query.permissions.findFirst({
          where: and(eq(schema.permissions.module, module), eq(schema.permissions.action, action)),
        }))!.id

      permMap[key] = permId
    }
  }

  console.log(`  ✓ ${MODULES.length * ACTIONS.length} permissions created`)

  console.log('\n  Assigning permissions to roles...')

  for (const [roleName, modulePerms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleName]!
    let count = 0

    for (const [module, actions] of Object.entries(modulePerms)) {
      for (const action of actions as Action[]) {
        const permId = permMap[`${module}:${action}`]
        if (permId) {
          await db
            .insert(schema.rolePermissions)
            .values({ roleId, permissionId: permId })
            .onConflictDoNothing()
          count++
        }
      }
    }

    console.log(`  ✓ ${roleName}: ${count} permissions`)
  }

  // ── 6. Seed Users ─────────────────────────────────────────────────────────

  console.log('\n  Creating seed users...')

  const SALT_ROUNDS = 10

  const seedUsers = [
    { email: ADMIN_EMAIL,                         password: ADMIN_PASSWORD, fullName: 'System Admin',       role: 'Admin' },
    { email: 'warehouse@wms.local',               password: ADMIN_PASSWORD, fullName: 'Warehouse Manager',  role: 'Warehouse Manager' },
    { email: 'factory@wms.local',                 password: ADMIN_PASSWORD, fullName: 'Factory Manager',    role: 'Factory Manager' },
    { email: 'warehousestaff@wms.local',          password: ADMIN_PASSWORD, fullName: 'Warehouse Staff',    role: 'Warehouse Staff' },
    { email: 'factorystaff@wms.local',            password: ADMIN_PASSWORD, fullName: 'Factory Staff',      role: 'Factory Staff' },
  ]

  for (const u of seedUsers) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS)

    const [user] = await db
      .insert(schema.users)
      .values({ orgId, email: u.email, passwordHash, fullName: u.fullName })
      .onConflictDoNothing()
      .returning()

    const userId = user?.id
      ?? (await db.query.users.findFirst({ where: eq(schema.users.email, u.email) }))!.id

    const roleId = roleMap[u.role]!

    await db
      .insert(schema.userRoles)
      .values({ userId, roleId })
      .onConflictDoNothing()

    console.log(`  ✓ User: ${u.email} (${u.role})`)
  }

  // ── 7. SKU Categories ─────────────────────────────────────────────────────

  console.log('\n  Creating SKU categories...')

  const categories = [
    { code: 'RAW', name: 'Raw Materials' },
    { code: 'COMP', name: 'Components' },
    { code: 'SEMI', name: 'Semi-Finished Goods' },
    { code: 'FG', name: 'Finished Goods' },
    { code: 'PKG', name: 'Packaging Materials' },
    { code: 'CONS', name: 'Consumables' },
  ]

  const catMap: Record<string, string> = {} // code → id

  for (const cat of categories) {
    const [inserted] = await db
      .insert(schema.skuCategories)
      .values({ orgId, code: cat.code, name: cat.name })
      .onConflictDoNothing()
      .returning()

    const catId = inserted?.id
      ?? (await db.query.skuCategories.findFirst({
          where: and(eq(schema.skuCategories.orgId, orgId), eq(schema.skuCategories.code, cat.code)),
        }))!.id

    catMap[cat.code] = catId
    console.log(`  ✓ Category: ${cat.name}`)
  }

  // ── 8. Sample SKUs ────────────────────────────────────────────────────────

  console.log('\n  Creating sample SKUs...')

  // Get the admin user ID to use as created_by
  const adminUser = await db.query.users.findFirst({
    where: eq(schema.users.email, ADMIN_EMAIL),
  })

  if (!adminUser) {
    throw new Error('Admin user not found — seed users must be created before SKUs')
  }

  const sampleSkus: schema.NewSku[] = [
    {
      orgId,
      skuCode: 'RM-STEEL-ROD-10',
      name: 'Steel Rod 10mm',
      description: 'Mild steel rod, 10mm diameter, 3m length',
      categoryId: catMap['RAW'],
      skuType: 'raw_material',
      uom: 'pcs',
      weightKg: '2.36',
      hsnCode: '7214',
      reorderPoint: '50',
      reorderQty: '200',
      leadTimeDays: 7,
      isBatchTracked: true,
      tags: ['steel', 'rod', 'raw-material'],
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'RM-STEEL-PLATE-3',
      name: 'Steel Plate 3mm',
      description: 'MS plate 3mm thickness, 1250×2500mm',
      categoryId: catMap['RAW'],
      skuType: 'raw_material',
      uom: 'sheet',
      weightKg: '73.50',
      hsnCode: '7208',
      reorderPoint: '10',
      reorderQty: '50',
      leadTimeDays: 10,
      isBatchTracked: true,
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'COMP-BOLT-M12-50',
      name: 'Hex Bolt M12×50',
      description: 'Grade 8.8 hex bolt M12×50mm, zinc plated',
      categoryId: catMap['COMP'],
      skuType: 'component',
      uom: 'pcs',
      weightKg: '0.065',
      hsnCode: '7318',
      barcode: '8901234567890',
      reorderPoint: '500',
      reorderQty: '2000',
      leadTimeDays: 3,
      isBatchTracked: false,
      tags: ['bolt', 'fastener', 'M12'],
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'COMP-NUT-M12',
      name: 'Hex Nut M12',
      description: 'Grade 8 hex nut M12, zinc plated',
      categoryId: catMap['COMP'],
      skuType: 'component',
      uom: 'pcs',
      hsnCode: '7318',
      reorderPoint: '500',
      reorderQty: '2000',
      leadTimeDays: 3,
      isBatchTracked: false,
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'COMP-BEARING-6205',
      name: 'Ball Bearing 6205',
      description: 'Deep groove ball bearing 6205 2RS, 25×52×15mm',
      categoryId: catMap['COMP'],
      skuType: 'component',
      uom: 'pcs',
      weightKg: '0.150',
      hsnCode: '8482',
      reorderPoint: '20',
      reorderQty: '100',
      leadTimeDays: 5,
      isBatchTracked: true,
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'SEMI-SPINDLE-ASSY-A',
      name: 'Spindle Assembly Type-A',
      description: 'Machined spindle assembly, pre-balanced, Type-A configuration',
      categoryId: catMap['SEMI'],
      skuType: 'semi_finished',
      uom: 'pcs',
      weightKg: '1.800',
      reorderPoint: '5',
      reorderQty: '20',
      isBatchTracked: true,
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'FG-DRILLCHUCK-13MM',
      name: 'Drill Chuck 13mm Keyed',
      description: 'Keyed drill chuck 13mm capacity, JT33 taper, heavy duty',
      categoryId: catMap['FG'],
      skuType: 'finished_good',
      uom: 'pcs',
      weightKg: '0.420',
      hsnCode: '8466',
      barcode: '8901234500001',
      reorderPoint: '25',
      reorderQty: '100',
      isBatchTracked: true,
      tags: ['chuck', 'drill', 'keyed', 'finished'],
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'FG-VICEGRIP-150MM',
      name: 'Machine Vice 150mm',
      description: 'Fixed base machine vice 150mm jaw width, hardened jaws',
      categoryId: catMap['FG'],
      skuType: 'finished_good',
      uom: 'pcs',
      weightKg: '8.500',
      hsnCode: '8466',
      barcode: '8901234500002',
      reorderPoint: '10',
      reorderQty: '50',
      isBatchTracked: true,
      tags: ['vice', 'machine', 'finished'],
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'PKG-BOX-SM',
      name: 'Corrugated Box Small',
      description: '5-ply corrugated box 200×150×100mm, brown kraft',
      categoryId: catMap['PKG'],
      skuType: 'packaging',
      uom: 'pcs',
      reorderPoint: '100',
      reorderQty: '500',
      leadTimeDays: 2,
      isBatchTracked: false,
      createdBy: adminUser.id,
    },
    {
      orgId,
      skuCode: 'PKG-BOX-MD',
      name: 'Corrugated Box Medium',
      description: '5-ply corrugated box 400×300×250mm, brown kraft',
      categoryId: catMap['PKG'],
      skuType: 'packaging',
      uom: 'pcs',
      reorderPoint: '50',
      reorderQty: '200',
      leadTimeDays: 2,
      isBatchTracked: false,
      createdBy: adminUser.id,
    },
  ]

  for (const sku of sampleSkus) {
    await db
      .insert(schema.skus)
      .values(sku)
      .onConflictDoNothing()

    console.log(`  ✓ SKU: ${sku.skuCode} — ${sku.name}`)
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\n✅  Seed completed successfully!\n')
  console.log('  Login credentials:')
  console.log(`  ┌─ Admin:             ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log('  ├─ Warehouse Manager: warehouse@wms.local / Admin@123')
  console.log('  ├─ Factory Manager:   factory@wms.local / Admin@123')
  console.log('  ├─ Warehouse Staff:   warehousestaff@wms.local / Admin@123')
  console.log('  └─ Factory Staff:     factorystaff@wms.local / Admin@123')
  console.log()
}

seed()
  .catch((err) => {
    console.error('❌  Seed failed:', err)
    process.exit(1)
  })
  .finally(() => client.end())
