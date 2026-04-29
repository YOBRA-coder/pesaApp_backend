export declare function generateCrashPoint(serverSeed: string, roundNumber: number): number;
export declare class GameService {
    getActiveCrashRound(): Promise<any>;
    placeBet(userId: string, gameType: string, betAmount: number, clientSeed?: string): Promise<{
        id: string;
        userId: string;
        createdAt: Date;
        result: import("@prisma/client/runtime/library").JsonValue | null;
        status: import(".prisma/client").$Enums.GameStatus;
        updatedAt: Date;
        crashPoint: import("@prisma/client/runtime/library").Decimal | null;
        serverSeed: string | null;
        betAmount: import("@prisma/client/runtime/library").Decimal;
        cashOutAt: import("@prisma/client/runtime/library").Decimal | null;
        winAmount: import("@prisma/client/runtime/library").Decimal | null;
        gameType: import(".prisma/client").$Enums.GameType;
        multiplier: import("@prisma/client/runtime/library").Decimal | null;
        clientSeed: string | null;
    }>;
    cashOut(userId: string, sessionId: string, currentMultiplier: number): Promise<{
        winAmount: number;
        multiplier: number;
    }>;
    settleCrashRound(roundId: string, crashPoint: number): Promise<void>;
    getHistory(userId: string, page?: number, limit?: number): Promise<{
        sessions: {
            id: string;
            userId: string;
            createdAt: Date;
            result: import("@prisma/client/runtime/library").JsonValue | null;
            status: import(".prisma/client").$Enums.GameStatus;
            updatedAt: Date;
            crashPoint: import("@prisma/client/runtime/library").Decimal | null;
            serverSeed: string | null;
            betAmount: import("@prisma/client/runtime/library").Decimal;
            cashOutAt: import("@prisma/client/runtime/library").Decimal | null;
            winAmount: import("@prisma/client/runtime/library").Decimal | null;
            gameType: import(".prisma/client").$Enums.GameType;
            multiplier: import("@prisma/client/runtime/library").Decimal | null;
            clientSeed: string | null;
        }[];
        total: number;
        page: number;
        totalPages: number;
    }>;
}
export declare const gameService: GameService;
//# sourceMappingURL=game.service.d.ts.map