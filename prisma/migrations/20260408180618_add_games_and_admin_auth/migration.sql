-- AlterTable
ALTER TABLE "CrashRound" ADD COLUMN     "houseProfit" DECIMAL(15,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "CrashBet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(10,2) NOT NULL,
    "cashOutAt" DECIMAL(10,4),
    "winAmount" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "autoCashout" DECIMAL(10,4),
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CrashBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinesGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(10,2) NOT NULL,
    "minesCount" INTEGER NOT NULL,
    "gridState" JSONB NOT NULL,
    "minePositions" JSONB NOT NULL,
    "gemsFound" INTEGER NOT NULL DEFAULT 0,
    "multiplier" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "winAmount" DECIMAL(10,2),
    "serverSeed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinesGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiceGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(10,2) NOT NULL,
    "target" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "roll" INTEGER NOT NULL,
    "multiplier" DECIMAL(10,4) NOT NULL,
    "won" BOOLEAN NOT NULL,
    "winAmount" DECIMAL(10,2) NOT NULL,
    "pnl" DECIMAL(10,2) NOT NULL,
    "serverSeed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiceGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlinkoGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "betAmount" DECIMAL(10,2) NOT NULL,
    "risk" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "multiplier" DECIMAL(10,4) NOT NULL,
    "winAmount" DECIMAL(10,2) NOT NULL,
    "path" JSONB,
    "serverSeed" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlinkoGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameRevenue" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gameType" TEXT NOT NULL,
    "totalBets" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalPayout" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "houseProfit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "roundCount" INTEGER NOT NULL DEFAULT 0,
    "playerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentCommission" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "commissionType" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalPerformance" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "totalCopies" INTEGER NOT NULL DEFAULT 0,
    "profitCopies" INTEGER NOT NULL DEFAULT 0,
    "lossCopies" INTEGER NOT NULL DEFAULT 0,
    "avgEntrySlip" DECIMAL(10,6),
    "avgPnl" DECIMAL(10,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRevenue" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalDeposits" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalWithdrawals" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "transactionFees" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "gameRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "billCommissions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "signalRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "agentCommissions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRevenue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrashBet_roundId_idx" ON "CrashBet"("roundId");

-- CreateIndex
CREATE INDEX "CrashBet_userId_idx" ON "CrashBet"("userId");

-- CreateIndex
CREATE INDEX "MinesGame_userId_idx" ON "MinesGame"("userId");

-- CreateIndex
CREATE INDEX "MinesGame_status_idx" ON "MinesGame"("status");

-- CreateIndex
CREATE INDEX "DiceGame_userId_idx" ON "DiceGame"("userId");

-- CreateIndex
CREATE INDEX "DiceGame_createdAt_idx" ON "DiceGame"("createdAt");

-- CreateIndex
CREATE INDEX "PlinkoGame_userId_idx" ON "PlinkoGame"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameRevenue_date_gameType_key" ON "GameRevenue"("date", "gameType");

-- CreateIndex
CREATE INDEX "AgentCommission_agentId_idx" ON "AgentCommission"("agentId");

-- CreateIndex
CREATE INDEX "AgentCommission_customerId_idx" ON "AgentCommission"("customerId");

-- CreateIndex
CREATE INDEX "AgentCommission_paid_idx" ON "AgentCommission"("paid");

-- CreateIndex
CREATE UNIQUE INDEX "SignalPerformance_signalId_key" ON "SignalPerformance"("signalId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRevenue_date_key" ON "DailyRevenue"("date");

-- CreateIndex
CREATE INDEX "CrashRound_roundNumber_idx" ON "CrashRound"("roundNumber");

-- CreateIndex
CREATE INDEX "CrashRound_createdAt_idx" ON "CrashRound"("createdAt");

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CrashRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinesGame" ADD CONSTRAINT "MinesGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiceGame" ADD CONSTRAINT "DiceGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlinkoGame" ADD CONSTRAINT "PlinkoGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentCommission" ADD CONSTRAINT "AgentCommission_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalPerformance" ADD CONSTRAINT "SignalPerformance_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
