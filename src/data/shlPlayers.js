// ── SHL 2026/2027 Teams & Players Database for Mini Fantasy ────────

export const SHL_SEASON = "2026/2027";

export const SHL_TEAMS = [
  { id: "IFB", name: "IF Björklöven", short: "IFB", city: "Umeå", color: "#00563b" },
  { id: "FBK", name: "Färjestad BK", short: "FBK", city: "Karlstad", color: "#006837" },
  { id: "FHC", name: "Frölunda HC", short: "FHC", city: "Göteborg", color: "#c4122f" },
  { id: "LHF", name: "Luleå Hockey", short: "LHF", city: "Luleå", color: "#ffcc00" },
  { id: "SAIK", name: "Skellefteå AIK", short: "SAIK", city: "Skellefteå", color: "#000000" },
  { id: "BIF", name: "Brynäs IF", short: "BIF", city: "Gävle", color: "#000000" },
  { id: "RBK", name: "Rögle BK", short: "RBK", city: "Ängelholm", color: "#007a3d" },
  { id: "VLH", name: "Växjö Lakers", short: "VLH", city: "Växjö", color: "#002b49" },
  { id: "TIK", name: "Timrå IK", short: "TIK", city: "Timrå", color: "#c8102e" },
  { id: "LHC", name: "Linköping HC", short: "LHC", city: "Linköping", color: "#002b49" },
  { id: "LIF", name: "Leksands IF", short: "LIF", city: "Leksand", color: "#00205b" },
  { id: "MIF", name: "Malmö Redhawks", short: "MIF", city: "Malmö", color: "#c8102e" },
  { id: "OHK", name: "Örebro HK", short: "OHK", city: "Örebro", color: "#d21034" },
  { id: "HV71", name: "HV71", short: "HV71", city: "Jönköping", color: "#002d62" }
];

export const SHL_PLAYERS = [
  // ═══════════════════════════════════════════════════════════════════
  // ── MÅLVAKTER (G) ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // IF Björklöven
  { id: "g_voutilainen", name: "Joona Voutilainen", team: "IFB", pos: "G", num: 30, price: 9, form: 9.3 },
  { id: "g_tuohimaa", name: "Frans Tuohimaa", team: "IFB", pos: "G", num: 33, price: 8, form: 8.6 },

  // Färjestad BK
  { id: "g_larmi", name: "Emil Larmi", team: "FBK", pos: "G", num: 33, price: 10, form: 9.5 },
  { id: "g_thelin", name: "Melker Thelin", team: "FBK", pos: "G", num: 35, price: 8, form: 8.4 },

  // Frölunda HC
  { id: "g_johansson_l", name: "Lars Johansson", team: "FHC", pos: "G", num: 31, price: 10, form: 9.4 },
  { id: "g_normann", name: "Tobias Normann", team: "FHC", pos: "G", num: 30, price: 8, form: 8.4 },

  // Brynäs IF
  { id: "g_clara", name: "Damian Clara", team: "BIF", pos: "G", num: 35, price: 9, form: 9.1 },
  { id: "g_kallgren", name: "Erik Källgren", team: "BIF", pos: "G", num: 30, price: 9, form: 8.9 },

  // Luleå Hockey
  { id: "g_ward", name: "Matteus Ward", team: "LHF", pos: "G", num: 34, price: 9, form: 9.1 },
  { id: "g_lassinantti", name: "Joel Lassinantti", team: "LHF", pos: "G", num: 31, price: 9, form: 8.9 },

  // Skellefteå AIK
  { id: "g_soderstrom", name: "Linus Söderström", team: "SAIK", pos: "G", num: 30, price: 10, form: 9.4 },
  { id: "g_lindvall", name: "Gustaf Lindvall", team: "SAIK", pos: "G", num: 32, price: 8, form: 8.6 },

  // Rögle BK
  { id: "g_rifalk", name: "Christoffer Rifalk", team: "RBK", pos: "G", num: 65, price: 9, form: 8.9 },
  { id: "g_holm", name: "Arvid Holm", team: "RBK", pos: "G", num: 30, price: 8, form: 8.5 },

  // Växjö Lakers
  { id: "g_persson_l", name: "Ludvig Persson", team: "VLH", pos: "G", num: 35, price: 9, form: 9.0 },
  { id: "g_ahman", name: "Adam Åhman", team: "VLH", pos: "G", num: 33, price: 8, form: 8.5 },

  // Timrå IK
  { id: "g_johansson_j", name: "Jacob Johansson", team: "TIK", pos: "G", num: 31, price: 9, form: 9.0 },
  { id: "g_dichow", name: "Frederik Dichow", team: "TIK", pos: "G", num: 35, price: 8, form: 8.5 },

  // Linköping HC
  { id: "g_ignatjew", name: "Waltteri Ignatjew", team: "LHC", pos: "G", num: 30, price: 9, form: 8.9 },
  { id: "g_myrenberg", name: "Jesper Myrenberg", team: "LHC", pos: "G", num: 31, price: 8, form: 8.5 },

  // Leksands IF
  { id: "g_gidlof", name: "Marcus Gidlöf", team: "LIF", pos: "G", num: 30, price: 9, form: 9.0 },
  { id: "g_hellsten", name: "Jakob Hellsten", team: "LIF", pos: "G", num: 35, price: 8, form: 8.5 },

  // HV71
  { id: "g_alnefelt", name: "Hugo Alnefelt", team: "HV71", pos: "G", num: 30, price: 9, form: 9.0 },
  { id: "g_lindbom_o", name: "Olof Lindbom", team: "HV71", pos: "G", num: 35, price: 8, form: 8.4 },

  // Örebro HK
  { id: "g_arntzen", name: "Jonas Arntzen", team: "OHK", pos: "G", num: 31, price: 9, form: 9.1 },
  { id: "g_enroth", name: "Jhonas Enroth", team: "OHK", pos: "G", num: 1, price: 8, form: 8.6 },

  // Malmö Redhawks
  { id: "g_langhamer", name: "Marek Langhamer", team: "MIF", pos: "G", num: 30, price: 9, form: 9.0 },
  { id: "g_marmenlind", name: "Daniel Marmenlind", team: "MIF", pos: "G", num: 35, price: 8, form: 8.5 },

  // ═══════════════════════════════════════════════════════════════════
  // ── BACKAR (D) ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // IF Björklöven
  { id: "d_niemela", name: "Topi Niemelä", team: "IFB", pos: "D", num: 7, price: 9, form: 9.2 },
  { id: "d_bjork", name: "Marcus Björk", team: "IFB", pos: "D", num: 52, price: 9, form: 9.0 },
  { id: "d_vainio", name: "Olli Vainio", team: "IFB", pos: "D", num: 37, price: 8, form: 8.7 },
  { id: "d_lindgren_j", name: "Jesper Lindgren", team: "IFB", pos: "D", num: 26, price: 8, form: 8.5 },
  { id: "d_tornqvist", name: "Tim Törnqvist", team: "IFB", pos: "D", num: 5, price: 7, form: 7.9 },

  // Färjestad BK
  { id: "d_nygren", name: "Magnus Nygren", team: "FBK", pos: "D", num: 73, price: 9, form: 8.9 },
  { id: "d_carlsson", name: "Gabriel Carlsson", team: "FBK", pos: "D", num: 55, price: 9, form: 9.0 },
  { id: "d_ollas", name: "Adam Ollas Mattsson", team: "FBK", pos: "D", num: 7, price: 8, form: 8.7 },
  { id: "d_bergkvist_fbk", name: "Axel Bergkvist", team: "FBK", pos: "D", num: 65, price: 8, form: 8.5 },
  { id: "d_roos", name: "Filip Roos", team: "FBK", pos: "D", num: 3, price: 8, form: 8.3 },

  // Frölunda HC
  { id: "d_tommernes", name: "Henrik Tömmernes", team: "FHC", pos: "D", num: 7, price: 10, form: 9.6 },
  { id: "d_folin", name: "Christian Folin", team: "FHC", pos: "D", num: 2, price: 8, form: 8.6 },
  { id: "d_hogberg", name: "Linus Högberg", team: "FHC", pos: "D", num: 33, price: 8, form: 8.5 },
  { id: "d_egli", name: "Dominik Egli", team: "FHC", pos: "D", num: 46, price: 9, form: 9.0 },
  { id: "d_nilsson_t", name: "Tom Nilsson", team: "FHC", pos: "D", num: 6, price: 7, form: 8.1 },

  // Brynäs IF
  { id: "d_djoos", name: "Christian Djoos", team: "BIF", pos: "D", num: 29, price: 10, form: 9.4 },
  { id: "d_kinnvall", name: "Johannes Kinnvall", team: "BIF", pos: "D", num: 9, price: 9, form: 9.1 },
  { id: "d_norlinder", name: "Mattias Norlinder", team: "BIF", pos: "D", num: 44, price: 9, form: 8.9 },
  { id: "d_andersson_a", name: "Axel Andersson", team: "BIF", pos: "D", num: 3, price: 8, form: 8.5 },
  { id: "d_bertilsson", name: "Simon Bertilsson", team: "BIF", pos: "D", num: 15, price: 7, form: 8.2 },

  // Luleå Hockey
  { id: "d_gustafsson", name: "Erik Gustafsson", team: "LHF", pos: "D", num: 29, price: 10, form: 9.4 },
  { id: "d_sellgren", name: "Jesper Sellgren", team: "LHF", pos: "D", num: 23, price: 9, form: 9.0 },
  { id: "d_laaksonen", name: "Oskari Laaksonen", team: "LHF", pos: "D", num: 5, price: 9, form: 8.9 },
  { id: "d_engsund", name: "Oscar Engsund", team: "LHF", pos: "D", num: 6, price: 8, form: 8.6 },
  { id: "d_sjalin_p", name: "Pontus Själin", team: "LHF", pos: "D", num: 32, price: 7, form: 8.2 },

  // Skellefteå AIK
  { id: "d_pudas", name: "Jonathan Pudas", team: "SAIK", pos: "D", num: 64, price: 10, form: 9.6 },
  { id: "d_djuse", name: "Emil Djuse", team: "SAIK", pos: "D", num: 58, price: 9, form: 9.0 },
  { id: "d_lundberg", name: "Arvid Lundberg", team: "SAIK", pos: "D", num: 52, price: 8, form: 8.5 },
  { id: "d_forsfjall_m", name: "Måns Forsfjäll", team: "SAIK", pos: "D", num: 44, price: 8, form: 8.4 },
  { id: "d_haara", name: "Frans Haara", team: "SAIK", pos: "D", num: 4, price: 7, form: 8.1 },

  // Rögle BK
  { id: "d_ekestahl", name: "Lucas Ekeståhl Jonsson", team: "RBK", pos: "D", num: 61, price: 9, form: 9.1 },
  { id: "d_johansson_f", name: "Filip Johansson", team: "RBK", pos: "D", num: 5, price: 9, form: 8.8 },
  { id: "d_sjalin_c", name: "Calle Själin", team: "RBK", pos: "D", num: 16, price: 8, form: 8.6 },
  { id: "d_dehaan", name: "Calvin de Haan", team: "RBK", pos: "D", num: 44, price: 8, form: 8.5 },
  { id: "d_goransson", name: "Mattias Göransson", team: "RBK", pos: "D", num: 3, price: 7, form: 8.0 },

  // Växjö Lakers
  { id: "d_persson_j", name: "Joel Persson", team: "VLH", pos: "D", num: 94, price: 10, form: 9.4 },
  { id: "d_rafferty", name: "Brogan Rafferty", team: "VLH", pos: "D", num: 24, price: 9, form: 9.0 },
  { id: "d_cooper", name: "Brian Cooper", team: "VLH", pos: "D", num: 8, price: 8, form: 8.6 },
  { id: "d_lowe", name: "Keegan Lowe", team: "VLH", pos: "D", num: 4, price: 8, form: 8.4 },
  { id: "d_rosen_e", name: "Elias Rosén", team: "VLH", pos: "D", num: 45, price: 7, form: 8.2 },

  // Timrå IK
  { id: "d_hardegard", name: "Marcus Hardegård", team: "TIK", pos: "D", num: 63, price: 9, form: 8.9 },
  { id: "d_forsmark", name: "Simon Forsmark", team: "TIK", pos: "D", num: 2, price: 8, form: 8.6 },
  { id: "d_svensson_p", name: "Per Svensson", team: "TIK", pos: "D", num: 28, price: 8, form: 8.3 },
  { id: "d_stromberg", name: "Didrik Strömberg", team: "TIK", pos: "D", num: 4, price: 7, form: 8.0 },
  { id: "d_freij", name: "Alfons Freij", team: "TIK", pos: "D", num: 27, price: 7, form: 8.1 },

  // Linköping HC
  { id: "d_lennstrom", name: "Theodor Lennström", team: "LHC", pos: "D", num: 81, price: 10, form: 9.4 },
  { id: "d_hultstrom", name: "Linus Hultström", team: "LHC", pos: "D", num: 56, price: 9, form: 9.0 },
  { id: "d_rissanen", name: "Rasmus Rissanen", team: "LHC", pos: "D", num: 55, price: 8, form: 8.5 },
  { id: "d_fantenberg", name: "Oscar Fantenberg", team: "LHC", pos: "D", num: 44, price: 8, form: 8.6 },
  { id: "d_aronsson", name: "Arvid Aronsson", team: "LHC", pos: "D", num: 28, price: 7, form: 8.0 },

  // Leksands IF
  { id: "d_caito", name: "Matt Caito", team: "LIF", pos: "D", num: 8, price: 9, form: 8.9 },
  { id: "d_larsson_e", name: "Eddie Larsson", team: "LIF", pos: "D", num: 26, price: 8, form: 8.5 },
  { id: "d_johansson_ant", name: "Anton Johansson", team: "LIF", pos: "D", num: 10, price: 8, form: 8.6 },
  { id: "d_lindholm_a", name: "Anton Lindholm", team: "LIF", pos: "D", num: 33, price: 8, form: 8.4 },
  { id: "d_nilsson_f", name: "Fred Nilsson", team: "LIF", pos: "D", num: 6, price: 7, form: 8.0 },

  // HV71
  { id: "d_kaski", name: "Oliwer Kaski", team: "HV71", pos: "D", num: 21, price: 9, form: 8.9 },
  { id: "d_hallquisth", name: "Wilhelm Hallquisth", team: "HV71", pos: "D", num: 44, price: 8, form: 8.5 },
  { id: "d_fransson", name: "Hugo Fransson", team: "HV71", pos: "D", num: 5, price: 8, form: 8.4 },
  { id: "d_engsund_p", name: "Pierre Engsund", team: "HV71", pos: "D", num: 17, price: 7, form: 8.1 },
  { id: "d_strandell", name: "Olle Strandell", team: "HV71", pos: "D", num: 4, price: 7, form: 7.9 },

  // Örebro HK
  { id: "d_quenneville", name: "David Quenneville", team: "OHK", pos: "D", num: 5, price: 9, form: 9.0 },
  { id: "d_seppala", name: "Peetro Seppälä", team: "OHK", pos: "D", num: 33, price: 8, form: 8.7 },
  { id: "d_berglund_f", name: "Filip Berglund", team: "OHK", pos: "D", num: 6, price: 8, form: 8.5 },
  { id: "d_arnesson", name: "Linus Arnesson", team: "OHK", pos: "D", num: 2, price: 7, form: 8.1 },
  { id: "d_norell", name: "Robin Norell", team: "OHK", pos: "D", num: 28, price: 7, form: 8.0 },

  // Malmö Redhawks
  { id: "d_alsing", name: "Olle Alsing", team: "MIF", pos: "D", num: 52, price: 9, form: 8.9 },
  { id: "d_kivihalme", name: "Teemu Kivihalme", team: "MIF", pos: "D", num: 22, price: 8, form: 8.6 },
  { id: "d_noren", name: "Patrik Norén", team: "MIF", pos: "D", num: 7, price: 8, form: 8.4 },
  { id: "d_badinka", name: "Dominik Badinka", team: "MIF", pos: "D", num: 79, price: 8, form: 8.5 },
  { id: "d_ivarsson", name: "Johan Ivarsson", team: "MIF", pos: "D", num: 47, price: 7, form: 8.1 },

  // ═══════════════════════════════════════════════════════════════════
  // ── FORWARDS (F) ───────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════
  // IF Björklöven
  { id: "f_wallmark", name: "Lucas Wallmark", team: "IFB", pos: "F", num: 23, price: 10, form: 9.7 },
  { id: "f_didomenico", name: "Chris DiDomenico", team: "IFB", pos: "F", num: 89, price: 10, form: 9.5 },
  { id: "f_digiuseppe", name: "Phil Di Giuseppe", team: "IFB", pos: "F", num: 19, price: 9, form: 9.3 },
  { id: "f_ottosson", name: "Axel Ottosson", team: "IFB", pos: "F", num: 18, price: 9, form: 9.0 },
  { id: "f_lundin_a", name: "Albin Lundin", team: "IFB", pos: "F", num: 22, price: 8, form: 8.8 },
  { id: "f_fortier", name: "Maxime Fortier", team: "IFB", pos: "F", num: 90, price: 9, form: 8.9 },
  { id: "f_dower_nilsson", name: "Liam Dower Nilsson", team: "IFB", pos: "F", num: 29, price: 8, form: 8.7 },
  { id: "f_possler", name: "Gustav Possler", team: "IFB", pos: "F", num: 71, price: 8, form: 8.4 },

  // Färjestad BK
  { id: "f_tomasek", name: "David Tomášek", team: "FBK", pos: "F", num: 96, price: 10, form: 9.8 },
  { id: "f_steen", name: "Oskar Steen", team: "FBK", pos: "F", num: 29, price: 10, form: 9.6 },
  { id: "f_nygard", name: "Joakim Nygård", team: "FBK", pos: "F", num: 11, price: 9, form: 9.2 },
  { id: "f_lodin", name: "Viktor Lodin", team: "FBK", pos: "F", num: 98, price: 9, form: 9.1 },
  { id: "f_johansson_l", name: "Linus Johansson", team: "FBK", pos: "F", num: 59, price: 9, form: 8.9 },
  { id: "f_studenic", name: "Marian Studenič", team: "FBK", pos: "F", num: 79, price: 8, form: 8.8 },
  { id: "f_aslund", name: "Per Åslund", team: "FBK", pos: "F", num: 22, price: 8, form: 8.6 },
  { id: "f_kellman", name: "Joel Kellman", team: "FBK", pos: "F", num: 13, price: 8, form: 8.5 },

  // Frölunda HC
  { id: "f_friberg", name: "Max Friberg", team: "FHC", pos: "F", num: 12, price: 10, form: 9.4 },
  { id: "f_weissbach", name: "Linus Weissbach", team: "FHC", pos: "F", num: 86, price: 9, form: 9.1 },
  { id: "f_peterson", name: "Jacob Peterson", team: "FHC", pos: "F", num: 40, price: 9, form: 9.0 },
  { id: "f_cederqvist", name: "Filip Cederqvist", team: "FHC", pos: "F", num: 17, price: 8, form: 8.7 },
  { id: "f_ruotsalainen", name: "Arttu Ruotsalainen", team: "FHC", pos: "F", num: 25, price: 9, form: 8.9 },
  { id: "f_lasu", name: "Nicklas Lasu", team: "FHC", pos: "F", num: 31, price: 8, form: 8.5 },
  { id: "f_innala", name: "Jere Innala", team: "FHC", pos: "F", num: 21, price: 9, form: 8.8 },
  { id: "f_born", name: "Isac Born", team: "FHC", pos: "F", num: 48, price: 7, form: 8.2 },

  // Brynäs IF
  { id: "f_silfverberg", name: "Jakob Silfverberg", team: "BIF", pos: "F", num: 33, price: 10, form: 9.5 },
  { id: "f_lindblom", name: "Oskar Lindblom", team: "BIF", pos: "F", num: 23, price: 10, form: 9.3 },
  { id: "f_larsson_j", name: "Johan Larsson", team: "BIF", pos: "F", num: 18, price: 9, form: 9.0 },
  { id: "f_rodin", name: "Anton Rödin", team: "BIF", pos: "F", num: 90, price: 9, form: 8.9 },
  { id: "f_kopacka", name: "Jack Kopacka", team: "BIF", pos: "F", num: 36, price: 9, form: 9.0 },
  { id: "f_bellows", name: "Kieffer Bellows", team: "BIF", pos: "F", num: 20, price: 9, form: 8.8 },
  { id: "f_olund", name: "Linus Ölund", team: "BIF", pos: "F", num: 41, price: 8, form: 8.4 },
  { id: "f_pettersson_l", name: "Lucas Pettersson", team: "BIF", pos: "F", num: 52, price: 8, form: 8.5 },

  // Luleå Hockey
  { id: "f_brome", name: "Mathias Bromé", team: "LHF", pos: "F", num: 86, price: 10, form: 9.5 },
  { id: "f_oneill", name: "Brian O'Neill", team: "LHF", pos: "F", num: 9, price: 9, form: 9.2 },
  { id: "f_nurmi", name: "Markus Nurmi", team: "LHF", pos: "F", num: 51, price: 9, form: 9.0 },
  { id: "f_levtchi", name: "Anton Levtchi", team: "LHF", pos: "F", num: 76, price: 9, form: 9.1 },
  { id: "f_andreasson", name: "Pontus Andreasson", team: "LHF", pos: "F", num: 96, price: 9, form: 8.9 },
  { id: "f_shinnimin", name: "Brendan Shinnimin", team: "LHF", pos: "F", num: 24, price: 8, form: 8.7 },
  { id: "f_eriksson_f", name: "Filip Eriksson", team: "LHF", pos: "F", num: 14, price: 8, form: 8.5 },
  { id: "f_brannstrom_i", name: "Isac Brännström", team: "LHF", pos: "F", num: 10, price: 8, form: 8.4 },

  // Skellefteå AIK
  { id: "f_lindberg", name: "Oscar Lindberg", team: "SAIK", pos: "F", num: 24, price: 10, form: 9.7 },
  { id: "f_hugg", name: "Rickard Hugg", team: "SAIK", pos: "F", num: 17, price: 9, form: 9.2 },
  { id: "f_johnson_a", name: "Andreas Johnson", team: "SAIK", pos: "F", num: 27, price: 9, form: 9.1 },
  { id: "f_lindholm_p", name: "Pär Lindholm", team: "SAIK", pos: "F", num: 40, price: 9, form: 8.9 },
  { id: "f_johnson_j", name: "Jonathan Johnson", team: "SAIK", pos: "F", num: 11, price: 9, form: 8.8 },
  { id: "f_okuliar", name: "Oliver Okuliar", team: "SAIK", pos: "F", num: 91, price: 9, form: 8.9 },
  { id: "f_vuollet", name: "Oskar Vuollet", team: "SAIK", pos: "F", num: 12, price: 8, form: 8.6 },
  { id: "f_forsfjall_z", name: "Zeb Forsfjäll", team: "SAIK", pos: "F", num: 16, price: 7, form: 8.2 },

  // Rögle BK
  { id: "f_bristedt", name: "Leon Bristedt", team: "RBK", pos: "F", num: 91, price: 10, form: 9.3 },
  { id: "f_everberg", name: "Dennis Everberg", team: "RBK", pos: "F", num: 18, price: 9, form: 9.0 },
  { id: "f_sandin", name: "Linus Sandin", team: "RBK", pos: "F", num: 28, price: 9, form: 8.9 },
  { id: "f_zaar", name: "Daniel Zaar", team: "RBK", pos: "F", num: 37, price: 9, form: 8.8 },
  { id: "f_bengtsson", name: "Anton Bengtsson", team: "RBK", pos: "F", num: 12, price: 8, form: 8.7 },
  { id: "f_olofsson_f", name: "Fredrik Olofsson", team: "RBK", pos: "F", num: 11, price: 8, form: 8.6 },
  { id: "f_kuhlman", name: "Karson Kuhlman", team: "RBK", pos: "F", num: 83, price: 8, form: 8.5 },
  { id: "f_nilsson_felix", name: "Felix Nilsson", team: "RBK", pos: "F", num: 21, price: 8, form: 8.4 },

  // Växjö Lakers
  { id: "f_elvenes", name: "Lucas Elvenes", team: "VLH", pos: "F", num: 25, price: 10, form: 9.4 },
  { id: "f_rasmussen", name: "Dennis Rasmussen", team: "VLH", pos: "F", num: 70, price: 9, form: 9.1 },
  { id: "f_cehlarik_vlh", name: "Peter Cehlárik", team: "VLH", pos: "F", num: 34, price: 9, form: 9.0 },
  { id: "f_suomi", name: "Eemeli Suomi", team: "VLH", pos: "F", num: 10, price: 9, form: 8.9 },
  { id: "f_mantykivi", name: "Matias Mäntykivi", team: "VLH", pos: "F", num: 19, price: 9, form: 8.8 },
  { id: "f_gustafsson_h", name: "Hugo Gustafsson", team: "VLH", pos: "F", num: 28, price: 8, form: 8.6 },
  { id: "f_agren", name: "Manuel Ågren", team: "VLH", pos: "F", num: 41, price: 8, form: 8.4 },
  { id: "f_henriksson", name: "Karl Henriksson", team: "VLH", pos: "F", num: 51, price: 8, form: 8.3 },

  // Timrå IK
  { id: "f_dahlen", name: "Jonathan Dahlén", team: "TIK", pos: "F", num: 54, price: 10, form: 9.6 },
  { id: "f_pettersson_e", name: "Emil Pettersson", team: "TIK", pos: "F", num: 89, price: 10, form: 9.3 },
  { id: "f_lander", name: "Anton Lander", team: "TIK", pos: "F", num: 51, price: 9, form: 9.1 },
  { id: "f_wedin", name: "Anton Wedin", team: "TIK", pos: "F", num: 22, price: 9, form: 8.8 },
  { id: "f_hallander", name: "Filip Hållander", team: "TIK", pos: "F", num: 15, price: 9, form: 9.0 },
  { id: "f_kivenmaki", name: "Otto Kivenmäki", team: "TIK", pos: "F", num: 29, price: 8, form: 8.6 },
  { id: "f_westfalt", name: "Marcus Westfält", team: "TIK", pos: "F", num: 78, price: 8, form: 8.4 },
  { id: "f_paajarvi", name: "Magnus Pääjärvi", team: "TIK", pos: "F", num: 56, price: 8, form: 8.3 },

  // Linköping HC
  { id: "f_kovacs", name: "Robin Kovács", team: "LHC", pos: "F", num: 96, price: 10, form: 9.5 },
  { id: "f_rattie", name: "Ty Rattie", team: "LHC", pos: "F", num: 39, price: 9, form: 9.1 },
  { id: "f_karlstrom", name: "Fredrik Karlström", team: "LHC", pos: "F", num: 21, price: 9, form: 9.0 },
  { id: "f_ljungh", name: "Markus Ljungh", team: "LHC", pos: "F", num: 61, price: 9, form: 8.9 },
  { id: "f_ehn", name: "Christoffer Ehn", team: "LHC", pos: "F", num: 19, price: 8, form: 8.7 },
  { id: "f_little", name: "Broc Little", team: "LHC", pos: "F", num: 41, price: 8, form: 8.6 },
  { id: "f_shore", name: "Nick Shore", team: "LHC", pos: "F", num: 90, price: 8, form: 8.5 },
  { id: "f_wagner", name: "Fabian Wagner", team: "LHC", pos: "F", num: 18, price: 7, form: 8.1 },

  // Leksands IF
  { id: "f_veronneau", name: "Max Véronneau", team: "LIF", pos: "F", num: 27, price: 10, form: 9.4 },
  { id: "f_lang", name: "Oskar Lang", team: "LIF", pos: "F", num: 14, price: 9, form: 9.1 },
  { id: "f_zackrisson", name: "Patrik Zackrisson", team: "LIF", pos: "F", num: 12, price: 8, form: 8.7 },
  { id: "f_ostman", name: "Kalle Östman", team: "LIF", pos: "F", num: 11, price: 8, form: 8.8 },
  { id: "f_eljas", name: "Arvid Eljas", team: "LIF", pos: "F", num: 16, price: 8, form: 8.5 },
  { id: "f_kloos", name: "Justin Kloos", team: "LIF", pos: "F", num: 25, price: 9, form: 8.9 },
  { id: "f_knuts", name: "Jon Knuts", team: "LIF", pos: "F", num: 13, price: 7, form: 8.2 },
  { id: "f_karlsson_m", name: "Martin Karlsson", team: "LIF", pos: "F", num: 7, price: 7, form: 8.0 },

  // HV71
  { id: "f_petersson", name: "André Petersson", team: "HV71", pos: "F", num: 20, price: 10, form: 9.3 },
  { id: "f_tedenby", name: "Mattias Tedenby", team: "HV71", pos: "F", num: 10, price: 9, form: 8.8 },
  { id: "f_borgstrom", name: "Henrik Borgström", team: "HV71", pos: "F", num: 19, price: 9, form: 9.0 },
  { id: "f_lenc", name: "Radan Lenc", team: "HV71", pos: "F", num: 26, price: 8, form: 8.7 },
  { id: "f_brannstrom_hv", name: "Isac Brännström", team: "HV71", pos: "F", num: 77, price: 8, form: 8.6 },
  { id: "f_luoto", name: "Joona Luoto", team: "HV71", pos: "F", num: 46, price: 8, form: 8.5 },
  { id: "f_reber", name: "Jamiro Reber", team: "HV71", pos: "F", num: 24, price: 8, form: 8.4 },
  { id: "f_tikka", name: "Tommi Tikka", team: "HV71", pos: "F", num: 88, price: 7, form: 8.1 },

  // Örebro HK
  { id: "f_karlkvist", name: "Patrik Karlkvist", team: "OHK", pos: "F", num: 90, price: 10, form: 9.5 },
  { id: "f_puistola", name: "Patrik Puistola", team: "OHK", pos: "F", num: 21, price: 9, form: 9.2 },
  { id: "f_ranta", name: "Sampo Ranta", team: "OHK", pos: "F", num: 86, price: 9, form: 9.0 },
  { id: "f_kossila", name: "Kalle Kossila", team: "OHK", pos: "F", num: 11, price: 9, form: 9.0 },
  { id: "f_wikman", name: "William Wikman", team: "OHK", pos: "F", num: 17, price: 8, form: 8.6 },
  { id: "f_mastomaki", name: "Christopher Mastomäki", team: "OHK", pos: "F", num: 40, price: 7, form: 8.2 },
  { id: "f_bjorninen", name: "Hannes Björninen", team: "OHK", pos: "F", num: 24, price: 8, form: 8.7 },
  { id: "f_leino", name: "Robert Leino", team: "OHK", pos: "F", num: 36, price: 8, form: 8.5 },

  // Malmö Redhawks
  { id: "f_handemark", name: "Fredrik Händemark", team: "MIF", pos: "F", num: 63, price: 9, form: 9.1 },
  { id: "f_oberg", name: "Linus Öberg", team: "MIF", pos: "F", num: 96, price: 9, form: 8.9 },
  { id: "f_persson_c", name: "Carl Persson", team: "MIF", pos: "F", num: 95, price: 8, form: 8.7 },
  { id: "f_pasic", name: "Nikola Pasic", team: "MIF", pos: "F", num: 20, price: 8, form: 8.6 },
  { id: "f_haapala", name: "Henrik Haapala", team: "MIF", pos: "F", num: 25, price: 9, form: 8.8 },
  { id: "f_forsberg_c", name: "Christoffer Forsberg", team: "MIF", pos: "F", num: 23, price: 7, form: 8.2 },
  { id: "f_salsten", name: "Eirik Salsten", team: "MIF", pos: "F", num: 27, price: 7, form: 8.0 },
  { id: "f_wernblom", name: "Lukas Wernblom", team: "MIF", pos: "F", num: 26, price: 8, form: 8.4 }
];

export const SHL_ROUNDS = [
  {
    id: "omg_1",
    roundNumber: 1,
    name: "Omgång 1 (Premiären)",
    dateRange: "19 sep 2026",
    status: "upcoming",
    lockTime: "2026-09-19T15:15:00",
    days: [
      {
        date: "2026-09-19",
        dayLabel: "Lördag 19 sep",
        games: [
          { id: "g_1_1", home: "SAIK", away: "IFB", date: "2026-09-19", time: "15:15", name: "Skellefteå AIK – IF Björklöven", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_2", home: "FHC", away: "VLH", date: "2026-09-19", time: "15:15", name: "Frölunda HC – Växjö Lakers", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_3", home: "HV71", away: "MIF", date: "2026-09-19", time: "15:15", name: "HV71 – Malmö Redhawks", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_4", home: "LHC", away: "TIK", date: "2026-09-19", time: "15:15", name: "Linköping HC – Timrå IK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_5", home: "BIF", away: "LIF", date: "2026-09-19", time: "18:00", name: "Brynäs IF – Leksands IF", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_6", home: "FBK", away: "OHK", date: "2026-09-19", time: "18:00", name: "Färjestad BK – Örebro HK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_1_7", home: "LHF", away: "RBK", date: "2026-09-19", time: "18:00", name: "Luleå Hockey – Rögle BK", status: "upcoming", homeScore: 0, awayScore: 0 }
        ]
      }
    ]
  },
  {
    id: "omg_3",
    roundNumber: 3,
    name: "Omgång 3 (2-dagars omgång)",
    dateRange: "24–26 sep 2026",
    status: "upcoming",
    lockTime: "2026-09-24T19:00:00",
    days: [
      {
        date: "2026-09-24",
        dayLabel: "Torsdag 24 sep (Dag 1)",
        games: [
          { id: "g_3_1", home: "FBK", away: "RBK", date: "2026-09-24", time: "19:00", name: "Färjestad BK – Rögle BK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_3_2", home: "HV71", away: "SAIK", date: "2026-09-24", time: "19:00", name: "HV71 – Skellefteå AIK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_3_3", home: "OHK", away: "IFB", date: "2026-09-24", time: "19:00", name: "Örebro HK – IF Björklöven", status: "upcoming", homeScore: 0, awayScore: 0 }
        ]
      },
      {
        date: "2026-09-26",
        dayLabel: "Lördag 26 sep (Dag 2)",
        games: [
          { id: "g_3_4", home: "BIF", away: "LHF", date: "2026-09-26", time: "15:15", name: "Brynäs IF – Luleå Hockey", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_3_5", home: "IFB", away: "FBK", date: "2026-09-26", time: "15:15", name: "IF Björklöven – Färjestad BK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_3_6", home: "RBK", away: "LHC", date: "2026-09-26", time: "18:00", name: "Rögle BK – Linköping HC", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_3_7", home: "MIF", away: "FHC", date: "2026-09-26", time: "18:00", name: "Malmö Redhawks – Frölunda HC", status: "upcoming", homeScore: 0, awayScore: 0 }
        ]
      }
    ]
  },
  {
    id: "omg_7",
    roundNumber: 7,
    name: "Omgång 7 (2-dagars helgbatalj)",
    dateRange: "8–10 okt 2026",
    status: "upcoming",
    lockTime: "2026-10-08T19:00:00",
    days: [
      {
        date: "2026-10-08",
        dayLabel: "Torsdag 8 okt (Dag 1)",
        games: [
          { id: "g_7_1", home: "FHC", away: "FBK", date: "2026-10-08", time: "19:00", name: "Frölunda HC – Färjestad BK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_7_2", home: "LHF", away: "TIK", date: "2026-10-08", time: "19:00", name: "Luleå Hockey – Timrå IK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_7_3", home: "LHC", away: "HV71", date: "2026-10-08", time: "19:00", name: "Linköping HC – HV71", status: "upcoming", homeScore: 0, awayScore: 0 }
        ]
      },
      {
        date: "2026-10-10",
        dayLabel: "Lördag 10 okt (Dag 2)",
        games: [
          { id: "g_7_4", home: "IFB", away: "SAIK", date: "2026-10-10", time: "15:15", name: "IF Björklöven – Skellefteå AIK", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_7_5", home: "BIF", away: "LIF", date: "2026-10-10", time: "15:15", name: "Brynäs IF – Leksands IF", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_7_6", home: "RBK", away: "MIF", date: "2026-10-10", time: "18:00", name: "Rögle BK – Malmö Redhawks", status: "upcoming", homeScore: 0, awayScore: 0 },
          { id: "g_7_7", home: "VLH", away: "OHK", date: "2026-10-10", time: "18:00", name: "Växjö Lakers – Örebro HK", status: "upcoming", homeScore: 0, awayScore: 0 }
        ]
      }
    ]
  }
];

export function getGamesForRound(round) {
  if (!round || !round.days) return [];
  return round.days.flatMap(d => d.games);
}

export const SHL_ROUND_GAMES = getGamesForRound(SHL_ROUNDS[0]);

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
