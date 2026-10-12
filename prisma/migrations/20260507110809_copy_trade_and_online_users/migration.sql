-- CreateTable
CREATE TABLE "CopyTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "targetTP" TEXT NOT NULL,
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "closePrice" DECIMAL(20,8),
    "pnl" DECIMAL(10,4),
    "pnlPercent" DECIMAL(10,4),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopyTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopyTrade_userId_idx" ON "CopyTrade"("userId");

-- CreateIndex
CREATE INDEX "CopyTrade_signalId_idx" ON "CopyTrade"("signalId");

-- CreateIndex
CREATE INDEX "CopyTrade_status_idx" ON "CopyTrade"("status");

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopyTrade" ADD CONSTRAINT "CopyTrade_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
