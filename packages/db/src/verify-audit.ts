import { db, inventoryBalances, skus, locations, sites, batches, users, stockLedger } from './client.js'
import { eq, and, or, ilike, gt, isNull } from 'drizzle-orm'
import { buildAddressHelpers } from '../../../apps/api/src/routes/inventory/handlers.js'

async function runAudit() {
  console.log('--- WMS VERIFICATION AUDIT DATA EXTRACTION ---')
  
  // 1. Resolve seed user
  const [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@wms.local'))
  if (!adminUser) {
    console.error('❌ Admin user not found. Please run pnpm db:seed first.')
    process.exit(1)
  }

  // 2. Fetch a SKU
  const [skuObj] = await db
    .select()
    .from(skus)
    .where(eq(skus.skuCode, 'COMP-BOLT-M12-50'))
  if (!skuObj) {
    console.error('❌ SKU COMP-BOLT-M12-50 not found.')
    process.exit(1)
  }

  // 3. Find a storage location
  const [storageLoc] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.isStorage, true), eq(locations.isActive, true), isNull(locations.deletedAt)))
    .limit(1)
  if (!storageLoc) {
    console.error('❌ No storage location found.')
    process.exit(1)
  }

  // 4. Create batch
  let [batch] = await db
    .select()
    .from(batches)
    .where(eq(batches.skuId, skuObj.id))
    .limit(1)

  if (!batch) {
    const [newBatch] = await db
      .insert(batches)
      .values({
        skuId: skuObj.id,
        batchNo: 'BAT-2026-001',
        lotNo: 'LOT-A',
        qcStatus: 'passed',
      })
      .returning()
    batch = newBatch
  }

  // 5. Ensure inventory balance exists
  const [existingBalance] = await db
    .select()
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.skuId, skuObj.id), eq(inventoryBalances.locationId, storageLoc.id)))

  if (!existingBalance) {
    console.log(`Creating test opening balance for SKU ${skuObj.skuCode} at location ${storageLoc.name}...`)
    await db
      .insert(stockLedger)
      .values({
        orgId: adminUser.orgId,
        eventType: 'opening_balance',
        skuId: skuObj.id,
        batchId: batch?.id,
        locationId: storageLoc.id,
        siteId: storageLoc.siteId,
        qty: '125.000000',
        uom: skuObj.uom,
        inventoryState: 'available',
        performedBy: adminUser.id,
        notes: 'Simulated opening stock for audit verification',
      })
  }

  console.log('\n[Database Verification] Target SKU Details:')
  console.log(JSON.stringify(skuObj, null, 2))

  // 6. Fetch inventory for SKU using queryBalances logic
  const rawData = await db
    .select({
      id: inventoryBalances.id,
      skuId: inventoryBalances.skuId,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationId: inventoryBalances.locationId,
      locationCode: locations.code,
      locationName: locations.name,
      locationPath: locations.path,
      quantity: inventoryBalances.qtyOnHand,
      uom: inventoryBalances.uom,
      inventoryState: inventoryBalances.inventoryState,
      batchNo: batches.batchNo,
    })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .leftJoin(batches, eq(inventoryBalances.batchId, batches.id))
    .where(and(eq(inventoryBalances.skuId, skuObj.id), gt(inventoryBalances.qtyOnHand, '0')))

  const { getReadableAddress, getHierarchyDetails } = await buildAddressHelpers(skuObj.orgId)

  const skuStockData = rawData.map((row) => {
    const details = getHierarchyDetails(row.locationPath || '')
    const displayAddress = getReadableAddress(row.locationPath || '')
    return {
      ...row,
      displayAddress,
      building: details.building,
      floor: details.floor,
      address: details.address,
    }
  })

  console.log('\n[API Verification Response] SKU Inquiry for COMP-BOLT-M12-50:')
  console.log(JSON.stringify(skuStockData, null, 2))

  if (skuStockData.length > 0) {
    const targetLocationId = skuStockData[0].locationId
    const targetLocationPath = skuStockData[0].locationPath

    console.log(`\nSelected Location for Inquiry: ${skuStockData[0].locationName} (${skuStockData[0].locationCode})`)

    // 7. Fetch location stock using GET /locations/:id/stock logic (P5)
    const rawLocationData = await db
      .select({
        id: inventoryBalances.id,
        skuId: inventoryBalances.skuId,
        skuCode: skus.skuCode,
        skuName: skus.name,
        locationId: inventoryBalances.locationId,
        locationCode: locations.code,
        locationName: locations.name,
        locationPath: locations.path,
        quantity: inventoryBalances.qtyOnHand,
        uom: inventoryBalances.uom,
        inventoryState: inventoryBalances.inventoryState,
        batchNo: batches.batchNo,
      })
      .from(inventoryBalances)
      .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
      .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
      .leftJoin(batches, eq(inventoryBalances.batchId, batches.id))
      .where(
        and(
          eq(inventoryBalances.siteId, storageLoc.siteId),
          or(
            eq(locations.path, targetLocationPath),
            ilike(locations.path, `${targetLocationPath}/%`)
          ),
          gt(inventoryBalances.qtyOnHand, '0')
        )
      )

    const locationItems = rawLocationData.map((row) => {
      const details = getHierarchyDetails(row.locationPath || '')
      const displayAddress = getReadableAddress(row.locationPath || '')
      return {
        ...row,
        displayAddress,
        building: details.building,
        floor: details.floor,
        address: details.address,
      }
    })

    console.log('\n[API Verification Response] Location Inquiry / Stock endpoint:')
    console.log(JSON.stringify({
      locationId: targetLocationId,
      locationPath: targetLocationPath,
      items: locationItems
    }, null, 2))
  }

  process.exit(0)
}

runAudit().catch((err) => {
  console.error(err)
  process.exit(1)
})
