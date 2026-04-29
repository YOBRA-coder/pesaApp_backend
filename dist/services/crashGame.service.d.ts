export declare function generateCrashPoint(serverSeed: string, roundNumber: number): number;
export declare class CrashGameService {
    createRound(): Promise<{
        roundId: string;
        crashPoint: number;
        serverSeedHash: string;
    }>;
    getCurrentRound(): Promise<{
        roundId: any;
        roundNumber: any;
        serverSeedHash: any;
        phase: string;
        multiplier: number;
    } | null>;
    placeBet(userId: string, roundId: string, betAmount: number, autoCashout?: number): Promise<{
        id: string;
        userId: string;
        status: string;
        roundId: string;
        betAmount: import("@prisma/client/runtime/library").Decimal;
        cashOutAt: import("@prisma/client/runtime/library").Decimal | null;
        winAmount: import("@prisma/client/runtime/library").Decimal | null;
        autoCashout: import("@prisma/client/runtime/library").Decimal | null;
        placedAt: Date;
        settledAt: Date | null;
    }>;
    cashOut(userId: string, roundId: string, currentMultiplier: number): Promise<{
        winAmount: number;
        multiplier: number;
    }>;
    settleRound(roundId: string, crashPoint: number): Promise<{
        houseProfit: number;
        pendingSettled: number;
    }>;
    getRoundHistory(limit?: number): Promise<{
        crashPoint: number;
        roundNumber: number;
        serverSeed: string;
        serverSeedHash: string;
        totalBets: import("@prisma/client/runtime/library").Decimal;
    }[]>;
    getUserBetHistory(userId: string, page?: number, limit?: number): Promise<{
        bets: ({
            round: {
                roundNumber: number;
                crashPoint: import("@prisma/client/runtime/library").Decimal;
                serverSeedHash: string;
            };
        } & {
            id: string;
            userId: string;
            status: string;
            roundId: string;
            betAmount: import("@prisma/client/runtime/library").Decimal;
            cashOutAt: import("@prisma/client/runtime/library").Decimal | null;
            winAmount: import("@prisma/client/runtime/library").Decimal | null;
            autoCashout: import("@prisma/client/runtime/library").Decimal | null;
            placedAt: Date;
            settledAt: Date | null;
        })[];
        total: number;
        page: number;
        totalPages: number;
    }>;
    getRoundBets(roundId: string): Promise<({
        user: {
            phone: string;
            username: string | null;
        };
    } & {
        id: string;
        userId: string;
        status: string;
        roundId: string;
        betAmount: import("@prisma/client/runtime/library").Decimal;
        cashOutAt: import("@prisma/client/runtime/library").Decimal | null;
        winAmount: import("@prisma/client/runtime/library").Decimal | null;
        autoCashout: import("@prisma/client/runtime/library").Decimal | null;
        placedAt: Date;
        settledAt: Date | null;
    })[]>;
    private updateDailyRevenue;
}
export declare function cacheRoundHistory(roundNumber: number, crashPoint: number): Promise<void>;
export declare const crashGameService: CrashGameService;
//# sourceMappingURL=crashGame.service.d.ts.map