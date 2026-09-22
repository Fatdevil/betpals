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
  },
  {
    id: 'padel_tourney',
    title: 'Padelevent',
    icon: '🎾',
    badge: 'Padel',
    description: 'Lagmatcher, Vinnare & Bäst smash',
    defaultName: 'Helgens Padelevent',
    rounds: [
      { name: 'Lag A vs Lag B (1-X-2)' }
    ],
    sideBets: [
      {
        name: '🏆 Vinnare av eventet',
        betMode: 'open',
        betAmount: 100,
        description: 'Vilket par tar hem hela eventet?'
      },
      {
        name: '💥 Mest over-the-fence smashar',
        betMode: 'self',
        betAmount: 50,
        description: 'Vem slår ut flest bollar ur buren?'
      }
    ]
  }
];

// ── The 4 Core Game Forms inside an Event ─────────────────
export const GAME_TYPES = [
  {
    id: 'winner',
    number: 1,
    title: '1. Vinnare',
    subtitle: 'Vem vinner?',
    icon: '🏆',
    badge: 'Poolodds',
    description: 'Alla bettar på vem som vinner. Dynamiska odds baserat på poolen.',
    defaultMode: 'open'
  },
  {
    id: 'winner_takes_all',
    number: 2,
    title: '2. Vinnare tar allt',
    subtitle: 'Grupp-pott',
    icon: '🦅',
    badge: 'Flest birdies',
    description: 'Alla lägger samma insats (t.ex. 100 kr). Den som gör flest birdies eller vinner tar potten (delas vid lika).',
    defaultMode: 'self',
    defaultStake: 100
  },
  {
    id: '1x2',
    number: 3,
    title: '3. 1 - X - 2',
    subtitle: 'Matchspel',
    icon: '⚽',
    badge: 'Match',
    description: 'Betta på hemmalag (1), oavgjort (X) eller bortalag (2).',
    defaultMode: 'open',
    defaultPlayers: ['1 (Hemmalag / Lag A)', 'X (Oavgjort)', '2 (Bortalag / Lag B)']
  },
  {
    id: 'yes_no',
    number: 4,
    title: '4. Ja / Nej',
    subtitle: 'Snabbt bet',
    icon: '👍',
    badge: 'Binärt',
    description: 'Snabba frågor under eventet: Görs det birdie på hål 18? Blir det förlängning?',
    defaultMode: 'open',
    defaultPlayers: ['👍 Ja', '👎 Nej']
  }
];
