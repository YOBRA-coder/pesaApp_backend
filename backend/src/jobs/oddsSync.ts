import axios from 'axios';
import { prisma } from '../config/database';
import cron from 'node-cron';

async function syncOdds() {
  const res = await axios.get('https://api.the-odds-api.com/v4/sports/soccer/odds', {
    params: {
      apiKey: process.env.ODDS_API_KEY,
      regions: 'eu',
      markets: 'h2h,totals,btts',
      oddsFormat: 'decimal',
    }
  });

  for (const game of res.data) {
    const h2h = game.bookmakers[0]?.markets.find((m:any) => m.key === 'h2h');
    if (!h2h) continue;

    const home = h2h.outcomes.find((o:any) => o.name === game.home_team)?.price;
    const away = h2h.outcomes.find((o:any) => o.name === game.away_team)?.price;
    const draw = h2h.outcomes.find((o:any) => o.name === 'Draw')?.price;

    await prisma.sportMatch.upsert({
      where: { id: game.id },
      update: { oddsHome: home, oddsDraw: draw, oddsAway: away, updatedAt: new Date() },
      create: {
        id: game.id,
        league: game.sport_key,
        homeTeam: game.home_team, awayTeam: game.away_team,
        kickoff: new Date(game.commence_time),
        status: 'upcoming',
        oddsHome: home, oddsDraw: draw || 0, oddsAway: away,
      },
    });
  }
}
// Sync every 5 minutes
cron.schedule('*/5 * * * *', syncOdds);