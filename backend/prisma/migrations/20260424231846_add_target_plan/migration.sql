-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "targetPlan" TEXT NOT NULL DEFAULT 'FREE';

-- CreateTable
CREATE TABLE "SportMatch" (
    "id" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "minute" INTEGER,
    "oddsHome" DECIMAL(6,3) NOT NULL,
    "oddsDraw" DECIMAL(6,3) NOT NULL,
    "oddsAway" DECIMAL(6,3) NOT NULL,
    "oddsOver25" DECIMAL(6,3),
    "oddsUnder25" DECIMAL(6,3),
    "oddsBttsYes" DECIMAL(6,3),
    "oddsBttsNo" DECIMAL(6,3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SportMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportBet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stake" DECIMAL(10,2) NOT NULL,
    "totalOdds" DECIMAL(10,4) NOT NULL,
    "potentialWin" DECIMAL(10,2) NOT NULL,
    "winAmount" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SportBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SportBetSelection" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "outcomeLabel" TEXT NOT NULL,
    "matchLabel" TEXT NOT NULL,
    "odds" DECIMAL(6,3) NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SportBetSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SportMatch_league_status_idx" ON "SportMatch"("league", "status");

-- CreateIndex
CREATE INDEX "SportMatch_kickoff_idx" ON "SportMatch"("kickoff");

-- CreateIndex
CREATE INDEX "SportBet_userId_idx" ON "SportBet"("userId");

-- CreateIndex
CREATE INDEX "SportBet_status_idx" ON "SportBet"("status");

-- CreateIndex
CREATE INDEX "SportBetSelection_betId_idx" ON "SportBetSelection"("betId");

-- CreateIndex
CREATE INDEX "SportBetSelection_matchId_idx" ON "SportBetSelection"("matchId");

-- AddForeignKey
ALTER TABLE "SportBet" ADD CONSTRAINT "SportBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportBetSelection" ADD CONSTRAINT "SportBetSelection_betId_fkey" FOREIGN KEY ("betId") REFERENCES "SportBet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportBetSelection" ADD CONSTRAINT "SportBetSelection_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "SportMatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
