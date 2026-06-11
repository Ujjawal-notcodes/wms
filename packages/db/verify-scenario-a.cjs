const postgres = require('postgres');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/ujjawalgupta/.gemini/antigravity/scratch/wms/.env' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in env');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL);

async function main() {
  try {
    console.log('--- WMS Scenario A Verification Script ---');

    // 1. Fetch Organization
    const [org] = await sql`SELECT id, name FROM organizations LIMIT 1`;
    if (!org) {
      throw new Error('No organization found in DB. Run seed first.');
    }
    const orgId = org.id;
    console.log(`✓ Scoped to organization: ${org.name} (${orgId})`);

    // 2. Fetch Admin User
    const [admin] = await sql`SELECT id, full_name FROM users WHERE email = 'admin@wms.local' LIMIT 1`;
    if (!admin) {
      throw new Error('No admin user found. Run seed first.');
    }
    const adminId = admin.id;
    console.log(`✓ Performing operations as: ${admin.full_name} (${adminId})`);

    // 3. Find or Create Site
    let siteId;
    const [existingSite] = await sql`SELECT id FROM sites WHERE code = 'S_TEST' AND org_id = ${orgId} LIMIT 1`;
    if (existingSite) {
      siteId = existingSite.id;
      console.log(`✓ Using existing test site: S_TEST (${siteId})`);
    } else {
      const [newSite] = await sql`
        INSERT INTO sites (org_id, name, code, site_type, is_active)
        VALUES (${orgId}, 'Scenario Test Site', 'S_TEST', 'warehouse', true)
        RETURNING id
      `;
      siteId = newSite.id;
      console.log(`✓ Created test site: S_TEST (${siteId})`);
    }

    // 4. Find or Create Location 1 (LOC_A1)
    let locA1Id;
    const [existingLocA1] = await sql`SELECT id FROM locations WHERE code = 'LOC_A1' AND site_id = ${siteId} LIMIT 1`;
    if (existingLocA1) {
      locA1Id = existingLocA1.id;
      console.log(`✓ Using existing source location: LOC_A1 (${locA1Id})`);
    } else {
      const [newLocA1] = await sql`
        INSERT INTO locations (site_id, name, code, level, is_storage, path, is_active)
        VALUES (${siteId}, 'Location A1', 'LOC_A1', 'rack', true, 'S_TEST/LOC_A1', true)
        RETURNING id
      `;
      locA1Id = newLocA1.id;
      console.log(`✓ Created source location: LOC_A1 (${locA1Id})`);
    }

    // 5. Find or Create Location 2 (LOC_A2)
    let locA2Id;
    const [existingLocA2] = await sql`SELECT id FROM locations WHERE code = 'LOC_A2' AND site_id = ${siteId} LIMIT 1`;
    if (existingLocA2) {
      locA2Id = existingLocA2.id;
      console.log(`✓ Using existing destination location: LOC_A2 (${locA2Id})`);
    } else {
      const [newLocA2] = await sql`
        INSERT INTO locations (site_id, name, code, level, is_storage, path, is_active)
        VALUES (${siteId}, 'Location A2', 'LOC_A2', 'rack', true, 'S_TEST/LOC_A2', true)
        RETURNING id
      `;
      locA2Id = newLocA2.id;
      console.log(`✓ Created destination location: LOC_A2 (${locA2Id})`);
    }

    // 6. Find or Create SKU (ST-ROD-12)
    let skuId;
    const [existingSku] = await sql`SELECT id FROM skus WHERE sku_code = 'ST-ROD-12' AND org_id = ${orgId} LIMIT 1`;
    if (existingSku) {
      skuId = existingSku.id;
      console.log(`✓ Using existing test SKU: ST-ROD-12 (${skuId})`);
      
      // Clean up previous ledger entries and balances for this SKU so we start fresh
      console.log('Cleaning up previous stock ledger and balances for ST-ROD-12...');
      await sql`DELETE FROM stock_ledger WHERE sku_id = ${skuId}`;
      await sql`DELETE FROM inventory_balances WHERE sku_id = ${skuId}`;
      console.log('✓ Cleanup complete');
    } else {
      const [newSku] = await sql`
        INSERT INTO skus (org_id, sku_code, name, sku_type, uom, created_by, reorder_point, reorder_qty)
        VALUES (${orgId}, 'ST-ROD-12', 'Steel Rod 12mm', 'raw_material', 'pcs', ${adminId}, 50, 100)
        RETURNING id
      `;
      skuId = newSku.id;
      console.log(`✓ Created test SKU: ST-ROD-12 (${skuId})`);
    }

    // Verify initial balance is 0 or non-existent
    const [initialBalance] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA1Id}`;
    console.log(`Initial Qty at LOC_A1: ${initialBalance ? initialBalance.qty_on_hand : 0}`);

    // --- STEP 1: Opening Balance = 100 units at LOC_A1 ---
    console.log('\n--- Step 1: Posting Opening Balance of 100 units at LOC_A1 ---');
    await sql`
      INSERT INTO stock_ledger (org_id, event_type, sku_id, location_id, site_id, qty, uom, inventory_state, performed_by, reference_type)
      VALUES (${orgId}, 'opening_balance', ${skuId}, ${locA1Id}, ${siteId}, 100, 'pcs', 'available', ${adminId}, 'manual')
    `;

    // Read balance after Step 1
    const [balanceStep1] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA1Id}`;
    console.log(`✓ Current Qty at LOC_A1: ${balanceStep1 ? balanceStep1.qty_on_hand : 0} (Expected: 100)`);

    // --- STEP 2: Transfer 30 units from LOC_A1 to LOC_A2 ---
    console.log('\n--- Step 2: Transferring 30 units from LOC_A1 to LOC_A2 ---');
    await sql.begin(async (tx) => {
      // 1. Transfer Out (negative qty)
      const [outRecord] = await tx`
        INSERT INTO stock_ledger (org_id, event_type, sku_id, location_id, site_id, qty, uom, inventory_state, performed_by, reference_type)
        VALUES (${orgId}, 'transfer_out', ${skuId}, ${locA1Id}, ${siteId}, -30, 'pcs', 'available', ${adminId}, 'transfer')
        RETURNING id
      `;

      // 2. Transfer In (positive qty, linking back to outRecord via reference_id)
      await tx`
        INSERT INTO stock_ledger (org_id, event_type, sku_id, location_id, site_id, qty, uom, inventory_state, performed_by, reference_type, reference_id)
        VALUES (${orgId}, 'transfer_in', ${skuId}, ${locA2Id}, ${siteId}, 30, 'pcs', 'available', ${adminId}, 'transfer', ${outRecord.id})
      `;
    });

    // Read balances after Step 2
    const [balanceStep2A1] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA1Id}`;
    const [balanceStep2A2] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA2Id}`;
    console.log(`✓ Current Qty at LOC_A1: ${balanceStep2A1 ? balanceStep2A1.qty_on_hand : 0} (Expected: 70)`);
    console.log(`✓ Current Qty at LOC_A2: ${balanceStep2A2 ? balanceStep2A2.qty_on_hand : 0} (Expected: 30)`);

    // --- STEP 3: Create Adjustment of -5 units at LOC_A1 ---
    console.log('\n--- Step 3: Posting negative adjustment of -5 units at LOC_A1 ---');
    await sql`
      INSERT INTO stock_ledger (org_id, event_type, sku_id, location_id, site_id, qty, uom, inventory_state, performed_by, reference_type)
      VALUES (${orgId}, 'adjustment_negative', ${skuId}, ${locA1Id}, ${siteId}, -5, 'pcs', 'available', ${adminId}, 'manual')
    `;

    // Read final balances
    const [finalA1] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA1Id}`;
    const [finalA2] = await sql`SELECT qty_on_hand FROM inventory_balances WHERE sku_id = ${skuId} AND location_id = ${locA2Id}`;
    console.log('\n--- Final Balance Verification ---');
    console.log(`LOC_A1 Qty: ${finalA1 ? finalA1.qty_on_hand : 0} (Expected: 65)`);
    console.log(`LOC_A2 Qty: ${finalA2 ? finalA2.qty_on_hand : 0} (Expected: 30)`);

    // Assert calculations
    const finalA1Num = Number(finalA1 ? finalA1.qty_on_hand : 0);
    const finalA2Num = Number(finalA2 ? finalA2.qty_on_hand : 0);

    if (finalA1Num === 65 && finalA2Num === 30) {
      console.log('\n🎉 SUCCESS: Scenario A calculations verified perfectly! (100 - 30 - 5 = 65) at LOC_A1, 30 at LOC_A2.');
    } else {
      throw new Error(`Calculation mismatch! Expected 65 and 30, got ${finalA1Num} and ${finalA2Num}`);
    }

  } catch (err) {
    console.error('❌ Scenario A Verification Failed:', err.message || err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();
