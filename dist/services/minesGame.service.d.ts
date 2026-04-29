export declare function calcMinesMultiplier(minesCount: number, gemsFound: number): number;
export declare class MinesGameService {
    startGame(userId: string, betAmount: number, minesCount: number): Promise<{
        gameId: string;
        betAmount: number;
        minesCount: number;
        gridSize: number;
        serverSeedHash: string;
        nextMultiplier: number;
    }>;
    revealCell(userId: string, gameId: string, cellIndex: number): Promise<{
        cashedOut: boolean;
        winAmount: number;
        multiplier: number;
        profit: number;
        gemsFound: number;
        minePositions: import("@prisma/client/runtime/library").JsonValue;
        serverSeed: string;
    } | {
        hit: string;
        cellIndex: number;
        gridState: ("hidden" | "mine" | "gem")[];
        minePositions: number[];
        serverSeed: string;
        winAmount: number;
        gemsFound?: undefined;
        multiplier?: undefined;
        nextMultiplier?: undefined;
        currentWin?: undefined;
        safeLeft?: undefined;
    } | {
        hit: string;
        cellIndex: number;
        gridState: string[];
        gemsFound: number;
        multiplier: number;
        nextMultiplier: number;
        currentWin: number;
        safeLeft: number;
        minePositions?: undefined;
        serverSeed?: undefined;
        winAmount?: undefined;
    }>;
    cashOut(userId: string, gameId: string): Promise<{
        cashedOut: boolean;
        winAmount: number;
        multiplier: number;
        profit: number;
        gemsFound: number;
        minePositions: import("@prisma/client/runtime/library").JsonValue;
        serverSeed: string;
    }>;
    getActiveGame(userId: string): Promise<{
        gameId: string;
        betAmount: number;
        minesCount: number;
        gridState: import("@prisma/client/runtime/library").JsonValue;
        gemsFound: number;
        multiplier: number;
        currentWin: number;
        serverSeedHash: string;
    } | null>;
    getGameHistory(userId: string, page?: number): Promise<{
        games: {
            id: string;
            createdAt: Date;
            status: string;
            betAmount: import("@prisma/client/runtime/library").Decimal;
            winAmount: import("@prisma/client/runtime/library").Decimal | null;
            multiplier: import("@prisma/client/runtime/library").Decimal;
            minesCount: number;
            gemsFound: number;
        }[];
        total: number;
    }>;
}
export declare const minesGameService: MinesGameService;
//# sourceMappingURL=minesGame.service.d.ts.map