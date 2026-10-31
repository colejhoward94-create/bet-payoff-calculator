// Hand-made PropLine-shaped response used by the tests and the local preview.
const ou = (player, point, over, under) => [
  { name: 'Over', description: player, point, price: over },
  { name: 'Under', description: player, point, price: under },
];

export const SAMPLE_ODDS = {
  id: 101,
  sport_key: 'football_nfl',
  home_team: 'Philadelphia Eagles',
  away_team: 'Dallas Cowboys',
  commence_time: '2026-11-01T21:25:00Z',
  bookmakers: [
    {
      key: 'draftkings', title: 'DraftKings',
      markets: [
        { key: 'player_pass_yds', outcomes: [...ou('Jalen Hurts', 224.5, -115, -105), ...ou('Dak Prescott', 254.5, -110, -110)] },
        { key: 'player_reception_yds', outcomes: [...ou('A.J. Brown', 68.5, -110, -110)] },
        { key: 'player_rush_yds', outcomes: [...ou('Saquon Barkley', 89.5, -110, -110)] },
        { key: 'player_anytime_td', outcomes: [
          { name: 'Yes', description: 'Saquon Barkley', price: 150 },
          { name: 'No', description: 'Saquon Barkley', price: -180 },
        ] },
        { key: 'player_kicking_points', outcomes: [...ou('Jake Elliott', 7.5, -110, -110)] },
        { key: 'player_pass_yds', period: 'q1', outcomes: [...ou('Q1 Guy', 60.5, -110, -110)] },
        { key: 'player_receptions', suspended_at: '2026-11-01T20:00:00Z', outcomes: [...ou('Pulled Guy', 4.5, -110, -110)] },
      ],
    },
    {
      key: 'fanduel', title: 'FanDuel',
      markets: [
        { key: 'player_pass_yds', outcomes: [...ou('Jalen Hurts', 224.5, -120, 100)] },
        { key: 'player_rush_yds', outcomes: [...ou('Saquon Barkley', 89.5, -105, -115), ...ou('Saquon Barkley', 84.5, -130, 100)] },
      ],
    },
    {
      key: 'pinnacle', title: 'Pinnacle',
      markets: [
        { key: 'player_pass_yds', outcomes: [...ou('Jalen Hurts', 224.5, -110, -110)] },
      ],
    },
    {
      key: 'prizepicks', title: 'PrizePicks',
      markets: [
        { key: 'player_pass_yds', outcomes: [
          { name: 'Over', description: 'Jalen Hurts', point: 224.5, price: 100, dfs_odds_type: 'standard' },
          { name: 'Under', description: 'Jalen Hurts', point: 224.5, price: 100, dfs_odds_type: 'standard' },
          { name: 'Over', description: 'Jalen Hurts', point: 199.5, price: 100, dfs_odds_type: 'goblin' },
        ] },
        { key: 'player_reception_yds', outcomes: [
          { name: 'Over', description: 'A.J. Brown', point: 70.5, price: 100, dfs_odds_type: 'standard' },
          { name: 'Under', description: 'A.J. Brown', point: 70.5, price: 100, dfs_odds_type: 'standard' },
        ] },
      ],
    },
    {
      key: 'underdog', title: 'Underdog Fantasy',
      markets: [
        { key: 'player_pass_yds', outcomes: [
          { name: 'Over', description: 'Jalen Hurts', point: 224.5, price: -122, payout_multiplier: 1.0 },
          { name: 'Under', description: 'Jalen Hurts', point: 224.5, price: -108, payout_multiplier: 1.0 },
          { name: 'Over', description: 'Jalen Hurts', point: 234.5, price: -122, payout_multiplier: 1.5 },
        ] },
      ],
    },
  ],
};

export const SAMPLE_EVENTS = [
  { id: 101, home_team: 'Philadelphia Eagles', away_team: 'Dallas Cowboys', commence_time: '2026-11-01T21:25:00Z' },
  { id: 102, home_team: 'Kansas City Chiefs', away_team: 'Buffalo Bills', commence_time: '2026-11-02T01:20:00Z' },
];
