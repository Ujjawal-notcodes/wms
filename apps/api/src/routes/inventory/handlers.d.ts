import type { FastifyRequest, FastifyReply } from 'fastify';
export declare function buildAddressHelpers(orgId: string): Promise<{
    getReadableAddress: (path: string) => string;
    getHierarchyDetails: (path: string) => {
        building: string;
        floor: string;
        address: string;
    };
}>;
export declare function postOpeningBalance(request: FastifyRequest, reply: FastifyReply): Promise<never>;
export declare function createAdjustment(request: FastifyRequest, reply: FastifyReply): Promise<never>;
export declare function queryBalances(request: FastifyRequest, reply: FastifyReply): Promise<never>;
export declare function queryMovements(request: FastifyRequest, reply: FastifyReply): Promise<never>;
export declare function getInventorySummary(request: FastifyRequest, reply: FastifyReply): Promise<never>;
export declare function getLowStock(_req: FastifyRequest, reply: FastifyReply): Promise<never>;
//# sourceMappingURL=handlers.d.ts.map