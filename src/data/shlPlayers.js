// ── SHL Teams & Players Database for Mini Fantasy ────────

export const SHL_TEAMS = [
  { id: "FBK", name: "Färjestad BK", short: "FBK", city: "Karlstad", color: "#006837" },
  { id: "FHC", name: "Frölunda HC", short: "FHC", city: "Göteborg", color: "#c4122f" },
  { id: "LHF", name: "Luleå Hockey", short: "LHF", city: "Luleå", color: "#ffcc00" },
  { id: "SAIK", name: "Skellefteå AIK", short: "SAIK", city: "Skellefteå", color: "#000000" },
  { id: "BIF", name: "Brynäs IF", short: "BIF", city: "Gävle", color: "#000000" },
  { id: "LIF", name: "Leksands IF", short: "LIF", city: "Leksand", color: "#00205b" },
  { id: "RBK", name: "Rögle BK", short: "RBK", city: "Ängelholm", color: "#007a3d" },
  { id: "VLH", name: "Växjö Lakers", short: "VLH", city: "Växjö", color: "#002b49" },
  { id: "TIK", name: "Timrå IK", short: "TIK", city: "Timrå", color: "#c8102e" },
  { id: "LHC", name: "Linköping HC", short: "LHC", city: "Linköping", color: "#002b49" },
  { id: "OHK", name: "Örebro HK", short: "OHK", city: "Örebro", color: "#d21034" },
  { id: "MODO", name: "MoDo Hockey", short: "MODO", city: "Örnsköldsvik", color: "#c8102e" },
  { id: "MIF", name: "Malmö Redhawks", short: "MIF", city: "Malmö", color: "#000000" },
  { id: "HV71", name: "HV71", short: "HV71", city: "Jönköping", color: "#002d62" }
];

export const SHL_PLAYERS = [
  // ── MÅLVAKTER (G) ──────────────────────────────────────
  { id: "g_lagace", name: "Maxime Lagacé", team: "FBK", pos: "G", num: 33, price: 10, form: 9.4 },
  { id: "g_johansson", name: "Lars Johansson", team: "FHC", pos: "G", num: 31, price: 10, form: 9.2 },
  { id: "g_ward", name: "Matteus Ward", team: "LHF", pos: "G", num: 34, price: 9, form: 8.8 },
  { id: "g_soderstrom", name: "Linus Söderström", team: "SAIK", pos: "G", num: 30, price: 9, form: 8.9 },
  { id: "g_persson", name: "Ludvig Persson", team: "BIF", pos: "G", num: 35, price: 8, form: 8.5 },
  { id: "g_gidlof", name: "Marcus Gidlöf", team: "LIF", pos: "G", num: 30, price: 8, form: 8.4 },
  { id: "g_rifalk", name: "Christoffer Rifalk", team: "RBK", pos: "G", num: 65, price: 8, form: 8.2 },
  { id: "g_larmi", name: "Emil Larmi", team: "VLH", pos: "G", num: 33, price: 9, form: 8.7 },
  { id: "g_juel", name: "Tim Juel", team: "TIK", pos: "G", num: 30, price: 8, form: 8.1 },
  { id: "g_myrenberg", name: "Jesper Myrenberg", team: "LHC", pos: "G", num: 31, price: 7, form: 7.9 },
  { id: "g_enroth", name: "Jhonas Enroth", team: "OHK", pos: "G", num: 1, price: 8, form: 8.0 },
  { id: "g_lehtinen", name: "Lassi Lehtinen", team: "MODO", pos: "G", num: 30, price: 8, form: 8.3 },
  { id: "g_marmenlind", name: "Daniel Marmenlind", team: "MIF", pos: "G", num: 35, price: 7, form: 7.8 },
  { id: "g_dichow", name: "Frederik Dichow", team: "HV71", pos: "G", num: 35, price: 7, form: 7.7 },

  // ── BACKAR (D) ─────────────────────────────────────────
  { id: "d_tommernes", name: "Henrik Tömmernes", team: "FHC", pos: "D", num: 7, price: 10, form: 9.5 },
  { id: "d_pudas", name: "Jonathan Pudas", team: "SAIK", pos: "D", num: 64, price: 10, form: 9.3 },
  { id: "d_djoos", name: "Christian Djoos", team: "BIF", pos: "D", num: 29, price: 9, form: 9.1 },
  { id: "d_nystrom", name: "Joel Nyström", team: "FBK", pos: "D", num: 32, price: 9, form: 8.8 },
  { id: "d_nygren", name: "Magnus Nygren", team: "FBK", pos: "D", num: 73, price: 8, form: 8.5 },
  { id: "d_gustafsson", name: "Erik Gustafsson", team: "LHF", pos: "D", num: 29, price: 9, form: 8.7 },
  { id: "d_sellgren", name: "Jesper Sellgren", team: "LHF", pos: "D", num: 23, price: 8, form: 8.3 },
  { id: "d_kapla", name: "Michael Kapla", team: "RBK", pos: "D", num: 56, price: 9, form: 8.6 },
  { id: "d_persson_j", name: "Joel Persson", team: "VLH", pos: "D", num: 94, price: 9, form: 8.9 },
  { id: "d_caito", name: "Matt Caito", team: "LIF", pos: "D", num: 8, price: 8, form: 8.2 },
  { id: "d_hultstrom", name: "Linus Hultström", team: "LHC", pos: "D", num: 56, price: 8, form: 8.4 },
  { id: "d_kaski", name: "Oliwer Kaski", team: "HV71", pos: "D", num: 21, price: 8, form: 8.0 },
  { id: "d_rundblad", name: "David Rundblad", team: "MODO", pos: "D", num: 7, price: 8, form: 8.1 },
  { id: "d_nasen", name: "Pontus Näsén", team: "MODO", pos: "D", num: 6, price: 7, form: 7.9 },
  { id: "d_kivihalme", name: "Teemu Kivihalme", team: "MIF", pos: "D", num: 22, price: 7, form: 7.8 },
  { id: "d_folin", name: "Christian Folin", team: "FHC", pos: "D", num: 2, price: 7, form: 8.0 },

  // ── FORWARDS (F) ───────────────────────────────────────
  { id: "f_tomasek", name: "David Tomášek", team: "FBK", pos: "F", num: 96, price: 10, form: 9.8 },
  { id: "f_omark", name: "Linus Omark", team: "LHF", pos: "F", num: 67, price: 10, form: 9.4 },
  { id: "f_silfverberg", name: "Jakob Silfverberg", team: "BIF", pos: "F", num: 33, price: 10, form: 9.3 },
  { id: "f_lindberg", name: "Oscar Lindberg", team: "SAIK", pos: "F", num: 24, price: 10, form: 9.6 },
  { id: "f_friberg", name: "Max Friberg", team: "FHC", pos: "F", num: 12, price: 9, form: 9.0 },
  { id: "f_dahlen", name: "Jonathan Dahlén", team: "TIK", pos: "F", num: 54, price: 9, form: 9.1 },
  { id: "f_lindblom", name: "Oskar Lindblom", team: "BIF", pos: "F", num: 23, price: 9, form: 8.9 },
  { id: "f_nygard", name: "Joakim Nygård", team: "FBK", pos: "F", num: 11, price: 9, form: 8.8 },
  { id: "f_hugg", name: "Rickard Hugg", team: "SAIK", pos: "F", num: 17, price: 8, form: 8.5 },
  { id: "f_cehlarik", name: "Peter Cehlárik", team: "LIF", pos: "F", num: 34, price: 9, form: 8.7 },
  { id: "f_veronneau", name: "Max Véronneau", team: "LIF", pos: "F", num: 27, price: 9, form: 8.8 },
  { id: "f_bristedt", name: "Leon Bristedt", team: "RBK", pos: "F", num: 91, price: 9, form: 8.9 },
  { id: "f_rattie", name: "Ty Rattie", team: "LHC", pos: "F", num: 39, price: 9, form: 8.7 },
  { id: "f_aagaard", name: "Mikkel Aagaard", team: "MODO", pos: "F", num: 29, price: 8, form: 8.4 },
  { id: "f_kuokkanen", name: "Janne Kuokkanen", team: "MIF", pos: "F", num: 27, price: 8, form: 8.3 },
  { id: "f_petersson", name: "André Petersson", team: "HV71", pos: "F", num: 20, price: 8, form: 8.2 },
  { id: "f_rosen", name: "Robert Rosén", team: "VLH", pos: "F", num: 87, price: 8, form: 8.5 },
  { id: "f_oneill", name: "Brian O'Neill", team: "LHF", pos: "F", num: 9, price: 9, form: 8.9 }
];

export const SHL_ROUND_GAMES = [
  { id: "g1", home: "FBK", away: "FHC", time: "19:00", name: "Färjestad BK – Frölunda HC" },
  { id: "g2", home: "LHF", away: "SAIK", time: "19:00", name: "Luleå Hockey – Skellefteå AIK" },
  { id: "g3", home: "BIF", away: "LIF", time: "19:00", name: "Brynäs IF – Leksands IF" },
  { id: "g4", home: "RBK", away: "VLH", time: "19:00", name: "Rögle BK – Växjö Lakers" },
  { id: "g5", home: "TIK", away: "MODO", time: "19:00", name: "Timrå IK – MoDo Hockey" },
  { id: "g6", home: "LHC", away: "HV71", time: "19:00", name: "Linköping HC – HV71" },
  { id: "g7", home: "OHK", away: "MIF", time: "19:00", name: "Örebro HK – Malmö Redhawks" }
];

// Poängregler
export const FANTASY_SCORING = {
  goalie: {
    win: 4,
    shutout: 5,
    goalAgainst: -1,
    savesPerTen: 1
  },
  defender: {
    goal: 4,
    assist: 2,
    plusMinusPlus: 1,
    plusMinusMinus: -1,
    blockedShot: 1
  },
  forward: {
    goal: 3,
    assist: 2,
    gwg: 2,
    hattrick: 3
  }
};
