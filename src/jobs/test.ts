const res = await axios.get('https://api.the-odds-api.com/v4/sports/soccer_epl/odds', {
  params: { apiKey: process.env.ODDS_API_KEY, regions: 'eu', markets: 'h2h,totals' }
});

if(res){
    
}