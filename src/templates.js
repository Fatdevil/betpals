// ── Tournament Templates ────────────────────────────────
export const TOURNAMENT_TEMPLATES = [
  {
    id: 'golf_trip',
    title: 'Golfresan',
    icon: '⛳',
    badge: 'Populär',
    description: 'Ronder, Närmast hål, Längsta drive & Flest birdies',
    defaultName: 'Golfresan 2026',
    rounds: [
      { name: 'Rond 1: Förstarundan' },
      { name: 'Rond 2: Finalrundan' }
    ],
    sideBets: [
      {
        name: '🎯 Närmast hål (Hål 7)',
        betMode: 'self',
        betAmount: 50,
        description: 'Vem sätter bollen närmast pinnen på hål 7?'
      },
      {
        name: '🚀 Längsta drive (Hål 14)',
        betMode: 'self',
        betAmount: 50,
        description: 'Vem dundrar iväg den längsta driven på hål 14?'
      },
      {
        name: '🦅 Flest birdies',
        betMode: 'self',
        betAmount: 100,
        description: 'Vem gör flest birdies under resan?'
      }
    ]
  },
  {
    id: 'football_night',
    title: 'Fotbollskvällen',
    icon: '⚽',
    badge: 'Matchdag',
    description: 'Slutresultat, Första målskytt & Gula kort',
    defaultName: 'Stora Matchkvällen',
    rounds: [
      { name: 'Slutresultat 1X2' }
    ],
    sideBets: [
      {
        name: '⚽ Första målskytt',
        betMode: 'open',
        betAmount: 50,
        description: 'Vem gör första målet?'
      },
      {
        name: '🟨 Flest varningar / Gula kort',
        betMode: 'open',
        betAmount: 50,
        description: 'Vem eller vilket lag drar på sig flest kort?'
      }
    ]
  },
  {
    id: 'party_night',
    title: 'Fest & AW',
    icon: '🍻',
    badge: 'Party',
    description: 'Sällskapsutmaningar & Skryt',
    defaultName: 'Helgens AW & Fest',
    rounds: [
      { name: 'Kvällens Mästare' }
    ],
    sideBets: [
      {
        name: '🕺 Kvällens Danskung/Drottning',
        betMode: 'open',
        betAmount: 50,
        description: 'Vem äger dansgolvet ikväll?'
      },
      {
        name: '🎤 Bäst sånginsats',
        betMode: 'open',
        betAmount: 50,
        description: 'Vem bjuder på kvällens bästa sånginsats?'
      }
    ]
  }
];
