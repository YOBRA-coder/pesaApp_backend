import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { phone: process.env.ADMIN_PHONE || '+254700000000' },
    update: {},
    create: {
      phone: process.env.ADMIN_PHONE || '+254700000000',
      firstName: 'PesaApp',
      lastName: 'Admin',
      username: 'admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      kycStatus: 'APPROVED',
      wallet: { create: { balance: 0 } },
    },
  });
  console.log('✅ Admin user:', admin.phone);

  // System config defaults
  const configs = [
    { key: 'maintenance_mode', value: 'false' },
    { key: 'min_deposit', value: '100' },
    { key: 'min_withdrawal', value: '100' },
    { key: 'max_daily_deposit_unverified', value: '10000' },
    { key: 'max_daily_deposit_verified', value: '300000' },
    { key: 'transaction_fee_percent', value: '1.5' },
    { key: 'house_edge_percent', value: '5' },
    { key: 'referral_bonus_kes', value: '200' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({ where: { key: config.key }, update: {}, create: config });
  }
  console.log('✅ System configs seeded');

  // Sample signals
  await prisma.signal.createMany({
    skipDuplicates: true,
    data: [
      { assetType: 'FOREX', pair: 'EUR/USD', direction: 'BUY', entryPrice: 1.082, stopLoss: 1.078, takeProfit1: 1.089, analysis: 'Strong bullish momentum on H4. RSI oversold.' },
      { assetType: 'FOREX', pair: 'GBP/JPY', direction: 'SELL', entryPrice: 191.4, stopLoss: 192.8, takeProfit1: 189.0, takeProfit2: 187.5, analysis: 'Bearish engulfing at key resistance.' },
      { assetType: 'CRYPTO', pair: 'BTC/USDT', direction: 'BUY', entryPrice: 67420, stopLoss: 65000, takeProfit1: 70000, takeProfit2: 72000, analysis: 'Bitcoin holding above 200 EMA. Bullish structure intact.' },
      { assetType: 'COMMODITY', pair: 'XAU/USD', direction: 'BUY', entryPrice: 2341, stopLoss: 2310, takeProfit1: 2380, analysis: 'Gold demand strong. Fed rate cut expectations.' },
    ],
  });
  console.log('✅ Sample signals created');

  console.log('\n🎉 Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
