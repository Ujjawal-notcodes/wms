import { db, stockLedger, inventoryBalances, skus, locations, sites, users, batches } from '@wms/db';
import { eq, and, or, ilike, count, sum, desc, inArray, gt, sql, isNull } from 'drizzle-orm';
import { createOpeningBalanceSchema, createAdjustmentSchema, inventoryQuerySchema, stockMovementQuerySchema, } from '@wms/shared';
// Helper to build readable location addresses and resolve building/floor/address details
export async function buildAddressHelpers(orgId) {
    const orgSites = await db
        .select({ code: sites.code, name: sites.name })
        .from(sites)
        .where(eq(sites.orgId, orgId));
    const orgLocs = await db
        .select({ code: locations.code, name: locations.name, path: locations.path, level: locations.level })
        .from(locations)
        .innerJoin(sites, eq(locations.siteId, sites.id))
        .where(and(eq(sites.orgId, orgId), isNull(locations.deletedAt)));
    const siteMap = new Map();
    for (const s of orgSites) {
        siteMap.set(s.code, s.name);
    }
    const locMap = new Map();
    for (const l of orgLocs) {
        locMap.set(l.path, { name: l.name, code: l.code, level: l.level });
    }
    const getReadableAddress = (path) => {
        if (!path)
            return 'N/A';
        const segments = path.split('/');
        const names = [];
        let currentPath = '';
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            if (i === 0) {
                const siteName = siteMap.get(seg);
                names.push(siteName || seg);
            }
            else {
                const loc = locMap.get(currentPath);
                names.push(loc ? loc.name : seg);
            }
        }
        return names.join(' > ');
    };
    const getHierarchyDetails = (path) => {
        if (!path)
            return { building: 'N/A', floor: 'N/A', address: 'N/A' };
        const segments = path.split('/');
        let currentPath = '';
        let building = '';
        let floor = '';
        const addressParts = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            currentPath = currentPath ? `${currentPath}/${seg}` : seg;
            if (i === 0)
                continue;
            const loc = locMap.get(currentPath);
            if (loc) {
                if (loc.level === 'building') {
                    building = loc.name;
                }
                else if (loc.level === 'floor') {
                    floor = loc.name;
                }
                else if (['zone', 'row', 'column', 'shelf'].includes(loc.level)) {
                    addressParts.push(loc.code);
                }
            }
        }
        return {
            building: building || 'N/A',
            floor: floor || 'N/A',
            address: addressParts.join('-') || 'N/A',
        };
    };
    return { getReadableAddress, getHierarchyDetails };
}
// ─────────────────────────────────────────────────────────────
// Opening Balance
// ─────────────────────────────────────────────────────────────
export async function postOpeningBalance(request, reply) {
    const orgId = request.user?.orgId;
    const userId = request.user?.sub;
    if (!orgId || !userId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' });
    }
    const parsed = createOpeningBalanceSchema.safeParse(request.body);
    if (!parsed.success) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid input parameters',
            details: parsed.error.flatten().fieldErrors,
        });
    }
    const { skuId, locationId, quantity, remarks } = parsed.data;
    // 1. Verify Location is a valid storage location
    const [loc] = await db
        .select({ siteId: locations.siteId, level: locations.level, isStorage: locations.isStorage })
        .from(locations)
        .innerJoin(sites, eq(locations.siteId, sites.id))
        .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId), isNull(locations.deletedAt)));
    if (!loc) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Specified location does not exist in your organization',
        });
    }
    if (!loc.isStorage) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: `Opening balance is not allowed for location level '${loc.level}' because it is not configured as a storage location.`,
        });
    }
    // 2. Check if an opening balance already exists for this SKU + Location
    const [existing] = await db
        .select({ id: stockLedger.id })
        .from(stockLedger)
        .where(and(eq(stockLedger.skuId, skuId), eq(stockLedger.locationId, locationId), eq(stockLedger.eventType, 'opening_balance')));
    if (existing) {
        return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'Opening balance already exists for this SKU and location.',
        });
    }
    // 3. Fetch SKU details to get UOM
    const [skuObj] = await db
        .select({ uom: skus.uom })
        .from(skus)
        .where(and(eq(skus.id, skuId), eq(skus.orgId, orgId)));
    if (!skuObj) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Specified SKU does not exist in your organization',
        });
    }
    // 4. Insert Movement Entry into stock_ledger (Trigger updates inventory_balances)
    const [newLedgerEntry] = await db
        .insert(stockLedger)
        .values({
        orgId,
        eventType: 'opening_balance',
        skuId,
        locationId,
        siteId: loc.siteId,
        qty: String(quantity),
        uom: skuObj.uom,
        inventoryState: 'available',
        performedBy: userId,
        notes: remarks || null,
        referenceType: 'manual',
    })
        .returning();
    return reply.status(201).send(newLedgerEntry);
}
// ─────────────────────────────────────────────────────────────
// Stock Adjustments
// ─────────────────────────────────────────────────────────────
export async function createAdjustment(request, reply) {
    const orgId = request.user?.orgId;
    const userId = request.user?.sub;
    if (!orgId || !userId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' });
    }
    const parsed = createAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid input parameters',
            details: parsed.error.flatten().fieldErrors,
        });
    }
    const { skuId, locationId, quantity, reason, notes } = parsed.data;
    // 1. Verify Location is a valid storage location
    const [loc] = await db
        .select({ siteId: locations.siteId, level: locations.level, isStorage: locations.isStorage })
        .from(locations)
        .innerJoin(sites, eq(locations.siteId, sites.id))
        .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId), isNull(locations.deletedAt)));
    if (!loc) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Specified location does not exist in your organization',
        });
    }
    if (!loc.isStorage) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: `Adjustment is not allowed for location level '${loc.level}' because it is not configured as a storage location.`,
        });
    }
    // 2. Fetch SKU details to get UOM
    const [skuObj] = await db
        .select({ uom: skus.uom })
        .from(skus)
        .where(and(eq(skus.id, skuId), eq(skus.orgId, orgId)));
    if (!skuObj) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Specified SKU does not exist in your organization',
        });
    }
    // 3. Map eventType to pgEnum value ('adjustment_positive' or 'adjustment_negative')
    const dbEventType = quantity > 0 ? 'adjustment_positive' : 'adjustment_negative';
    // 4. Insert Movement Entry into stock_ledger
    const [newLedgerEntry] = await db
        .insert(stockLedger)
        .values({
        orgId,
        eventType: dbEventType,
        skuId,
        locationId,
        siteId: loc.siteId,
        qty: String(quantity),
        uom: skuObj.uom,
        inventoryState: 'available',
        performedBy: userId,
        notes: notes || reason,
        referenceType: 'manual',
    })
        .returning();
    return reply.status(201).send(newLedgerEntry);
}
// ─────────────────────────────────────────────────────────────
// Query Stock Balances
// ─────────────────────────────────────────────────────────────
export async function queryBalances(request, reply) {
    const orgId = request.user?.orgId;
    if (!orgId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' });
    }
    const parsed = inventoryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid query parameters',
            details: parsed.error.flatten().fieldErrors,
        });
    }
    const { q, locationId, skuId, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const conditions = [
        eq(inventoryBalances.orgId, orgId),
    ];
    if (locationId) {
        conditions.push(eq(inventoryBalances.locationId, locationId));
    }
    if (skuId) {
        conditions.push(eq(inventoryBalances.skuId, skuId));
    }
    if (q) {
        const searchFilter = or(ilike(skus.skuCode, `%${q}%`), ilike(skus.name, `%${q}%`), ilike(skus.barcode, `%${q}%`), ilike(locations.code, `%${q}%`), ilike(locations.name, `%${q}%`), ilike(locations.path, `%${q}%`));
        if (searchFilter) {
            conditions.push(searchFilter);
        }
    }
    const [totalCountRow] = await db
        .select({ total: count(inventoryBalances.id) })
        .from(inventoryBalances)
        .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
        .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
        .where(and(...conditions));
    const total = totalCountRow?.total ?? 0;
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
        .where(and(...conditions))
        .limit(limit)
        .offset(offset)
        .orderBy(skus.skuCode, locations.code);
    const { getReadableAddress, getHierarchyDetails } = await buildAddressHelpers(orgId);
    const data = rawData.map((row) => {
        const details = getHierarchyDetails(row.locationPath || '');
        const displayAddress = getReadableAddress(row.locationPath || '');
        return {
            ...row,
            displayAddress,
            building: details.building,
            floor: details.floor,
            address: details.address,
        };
    });
    return reply.send({
        data,
        total,
        page,
        limit,
        hasMore: offset + data.length < total,
    });
}
// ─────────────────────────────────────────────────────────────
// Stock Ledger Transactions History
// ─────────────────────────────────────────────────────────────
export async function queryMovements(request, reply) {
    const orgId = request.user?.orgId;
    if (!orgId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' });
    }
    const parsed = stockMovementQuerySchema.safeParse(request.query);
    if (!parsed.success) {
        return reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: 'Invalid query parameters',
            details: parsed.error.flatten().fieldErrors,
        });
    }
    const { q, eventType, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const conditions = [
        eq(stockLedger.orgId, orgId),
    ];
    if (eventType) {
        if (eventType === 'adjustment') {
            conditions.push(inArray(stockLedger.eventType, ['adjustment_positive', 'adjustment_negative']));
        }
        else {
            conditions.push(eq(stockLedger.eventType, eventType));
        }
    }
    if (q) {
        const searchFilter = or(ilike(skus.skuCode, `%${q}%`), ilike(skus.name, `%${q}%`), ilike(locations.code, `%${q}%`), ilike(locations.name, `%${q}%`));
        if (searchFilter) {
            conditions.push(searchFilter);
        }
    }
    const [totalCountRow] = await db
        .select({ total: count(stockLedger.id) })
        .from(stockLedger)
        .innerJoin(skus, eq(stockLedger.skuId, skus.id))
        .innerJoin(locations, eq(stockLedger.locationId, locations.id))
        .where(and(...conditions));
    const total = totalCountRow?.total ?? 0;
    const dbData = await db
        .select({
        id: stockLedger.id,
        skuCode: skus.skuCode,
        skuName: skus.name,
        locationCode: locations.code,
        locationName: locations.name,
        eventType: stockLedger.eventType,
        quantity: stockLedger.qty,
        uom: stockLedger.uom,
        performedByName: users.fullName,
        performedAt: stockLedger.performedAt,
        notes: stockLedger.notes,
    })
        .from(stockLedger)
        .innerJoin(skus, eq(stockLedger.skuId, skus.id))
        .innerJoin(locations, eq(stockLedger.locationId, locations.id))
        .innerJoin(users, eq(stockLedger.performedBy, users.id))
        .where(and(...conditions))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(stockLedger.performedAt));
    // Map database enum eventType values back to unified app events
    const data = dbData.map((row) => {
        let mappedEventType = row.eventType;
        if (row.eventType === 'adjustment_positive' || row.eventType === 'adjustment_negative') {
            mappedEventType = 'adjustment';
        }
        return {
            ...row,
            eventType: mappedEventType,
        };
    });
    return reply.send({
        data,
        total,
        page,
        limit,
        hasMore: offset + data.length < total,
    });
}
// ─────────────────────────────────────────────────────────────
// Aggregated KPIs Summary
// ─────────────────────────────────────────────────────────────
export async function getInventorySummary(request, reply) {
    const orgId = request.user?.orgId;
    if (!orgId) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' });
    }
    const [stats] = await db
        .select({
        totalSkus: sql `count(distinct ${inventoryBalances.skuId})`,
        totalQuantity: sum(inventoryBalances.qtyOnHand),
        activeLocations: sql `count(distinct ${inventoryBalances.locationId})`,
    })
        .from(inventoryBalances)
        .where(and(eq(inventoryBalances.orgId, orgId), gt(inventoryBalances.qtyOnHand, '0')));
    return reply.send({
        totalSkus: Number(stats?.totalSkus ?? 0),
        totalQuantity: Number(stats?.totalQuantity ?? 0),
        activeLocations: Number(stats?.activeLocations ?? 0),
    });
}
export async function getLowStock(_req, reply) {
    return reply.status(501).send({ message: 'Not implemented yet' });
}
//# sourceMappingURL=handlers.js.map