"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const database_1 = require("../config/database");
const node_cron_1 = __importDefault(require("node-cron"));
async function syncOdds() {
    const res = await axios_1.default.get('https://api.the-odds-api.com/v4/sports/soccer/odds', {
        params: {
            apiKey: process.env.ODDS_API_KEY,
            regions: 'eu',
            markets: 'h2h,totals,btts',
            oddsFormat: 'decimal',
        }
    });
    for (const game of res.data) {
        const h2h = game.bookmakers[0]?.markets.find((m) => m.key === 'h2h');
        if (!h2h)
            continue;
        const home = h2h.outcomes.find((o) => o.name === game.home_team)?.price;
        const away = h2h.outcomes.find((o) => o.name === game.away_team)?.price;
        const draw = h2h.outcomes.find((o) => o.name === 'Draw')?.price;
        await database_1.prisma.sportMatch.upsert({
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
node_cron_1.default.schedule('*/5 * * * *', syncOdds);
//# sourceMappingURL=oddsSync.js.map