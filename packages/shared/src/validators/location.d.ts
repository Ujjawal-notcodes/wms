import { z } from 'zod';
export declare const LOCATION_LEVELS: readonly ["site", "building", "floor", "zone", "row", "column", "shelf"];
/**
 * Validates level sequence and hierarchy rules in the location tree.
 * Depth Index: site (0) → building (1) → floor (2) → zone (3) → row (4) → column (5) → shelf (6).
 */
export declare function validateHierarchy(level: string, parentLevel: string | null): boolean;
export declare const createSiteSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    siteType: z.ZodEnum<["factory", "warehouse", "3pl", "transit"]>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    code: string;
    siteType: "factory" | "warehouse" | "3pl" | "transit";
    isActive: boolean;
}, {
    name: string;
    code: string;
    siteType: "factory" | "warehouse" | "3pl" | "transit";
    isActive?: boolean | undefined;
}>;
export declare const updateSiteSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    siteType: z.ZodOptional<z.ZodEnum<["factory", "warehouse", "3pl", "transit"]>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    siteType?: "factory" | "warehouse" | "3pl" | "transit" | undefined;
    isActive?: boolean | undefined;
}, {
    name?: string | undefined;
    siteType?: "factory" | "warehouse" | "3pl" | "transit" | undefined;
    isActive?: boolean | undefined;
}>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export declare const createLocationSchema: z.ZodObject<{
    siteId: z.ZodString;
    parentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    name: z.ZodString;
    code: z.ZodString;
    level: z.ZodEnum<["site", "building", "floor", "zone", "row", "column", "shelf"]>;
    isStorage: z.ZodDefault<z.ZodBoolean>;
    capacity: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    capacityUnit: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    maxWeight: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    maxVolume: z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>;
    notes: z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>;
    isActive: z.ZodDefault<z.ZodBoolean>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    code: string;
    isActive: boolean;
    siteId: string;
    level: "site" | "building" | "floor" | "zone" | "row" | "column" | "shelf";
    isStorage: boolean;
    metadata: Record<string, unknown>;
    parentId?: string | null | undefined;
    capacity?: number | undefined;
    capacityUnit?: string | undefined;
    maxWeight?: number | undefined;
    maxVolume?: number | undefined;
    notes?: string | undefined;
}, {
    name: string;
    code: string;
    siteId: string;
    level: "site" | "building" | "floor" | "zone" | "row" | "column" | "shelf";
    isActive?: boolean | undefined;
    parentId?: string | null | undefined;
    isStorage?: boolean | undefined;
    capacity?: unknown;
    capacityUnit?: unknown;
    maxWeight?: unknown;
    maxVolume?: unknown;
    notes?: unknown;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const updateLocationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    isStorage: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    capacity: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>>;
    capacityUnit: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>>;
    maxWeight: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>>;
    maxVolume: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNumber>, number | undefined, unknown>>;
    notes: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodString>, string | undefined, unknown>>;
    metadata: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    isActive?: boolean | undefined;
    isStorage?: boolean | undefined;
    capacity?: number | undefined;
    capacityUnit?: string | undefined;
    maxWeight?: number | undefined;
    maxVolume?: number | undefined;
    notes?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    name?: string | undefined;
    isActive?: boolean | undefined;
    isStorage?: boolean | undefined;
    capacity?: unknown;
    capacityUnit?: unknown;
    maxWeight?: unknown;
    maxVolume?: unknown;
    notes?: unknown;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const locationQuerySchema: z.ZodObject<{
    siteId: z.ZodOptional<z.ZodString>;
    parentId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    level: z.ZodOptional<z.ZodEnum<["site", "building", "floor", "zone", "row", "column", "shelf"]>>;
    isStorage: z.ZodOptional<z.ZodBoolean>;
    isActive: z.ZodOptional<z.ZodBoolean>;
    pathPrefix: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    isActive?: boolean | undefined;
    siteId?: string | undefined;
    parentId?: string | null | undefined;
    level?: "site" | "building" | "floor" | "zone" | "row" | "column" | "shelf" | undefined;
    isStorage?: boolean | undefined;
    pathPrefix?: string | undefined;
}, {
    isActive?: boolean | undefined;
    siteId?: string | undefined;
    parentId?: string | null | undefined;
    level?: "site" | "building" | "floor" | "zone" | "row" | "column" | "shelf" | undefined;
    isStorage?: boolean | undefined;
    pathPrefix?: string | undefined;
}>;
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
export type LocationQueryInput = z.infer<typeof locationQuerySchema>;
//# sourceMappingURL=location.d.ts.map