export declare class DiceGameService {
    roll(userId: string, betAmount: number, target: number, mode: 'OVER' | 'UNDER', clientSeed?: string): Promise<{
        roll: number;
        target: number;
        mode: "OVER" | "UNDER";
        won: boolean;
        multiplier: number;
        winAmount: number;
        pnl: number;
        serverSeed: string;
        clientSeed: string;
        newBalance: number;
    }>;
    getHistory(userId: string, page?: number): Promise<{
        games: {
            id: string;
            userId: string;
            createdAt: Date;
            serverSeed: string;
            betAmount: import("@prisma/client/runtime/library").Decimal;
            winAmount: import("@prisma/client/runtime/library").Decimal;
            multiplier: import("@prisma/client/runtime/library").Decimal;
            target: number;
            mode: string;
            roll: number;
            won: boolean;
            pnl: import("@prisma/client/runtime/library").Decimal;
        }[];
        total: number;
    }>;
    getStats(userId: string): Promise<{
        wins: number;
        losses: number;
        totalBet: number;
        netPnl: number;
        winRate: number;
    }>;
}
export declare class PlinkoGameService {
    drop(userId: string, betAmount: number, risk: 'LOW' | 'MEDIUM' | 'HIGH'): Promise<{
        path: number[];
        slot: number;
        multiplier: number;
        winAmount: number;
        pnl: number;
        serverSeed: string;
        multipliers: number[];
        newBalance: number;
    }>;
    getHistory(userId: string, page?: number): Promise<{
        games: {
            id: string;
            createdAt: Date;
            betAmount: import("@prisma/client/runtime/library").Decimal;
            winAmount: import("@prisma/client/runtime/library").Decimal;
            multiplier: import("@prisma/client/runtime/library").Decimal;
            slot: number;
            risk: string;
        }[];
        total: number;
    }>;
}
export declare const diceGameService: DiceGameService;
export declare const plinkoGameService: PlinkoGameService;
//# sourceMappingURL=diceAndPlinko.service.d.ts.map