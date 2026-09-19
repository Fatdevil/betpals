// ── 🏒 SHL Mini Fantasy Component ─────────────────────────
import { showModal, closeModal } from "./modal.js";
import { t, getLang } from "../i18n.js";
import { getStoredUser, isLoggedIn } from "../auth.js";
import { getFriends, createShlLeague, getShlLeague, joinShlLeague, inviteFriendsToShlLeague, settleShlLeague, simulateShlLeague, toggleShlPaid, connectWebSocket, onWebSocketMessage, disconnectWebSocket } from "../api.js";
import { showToast, createSwishUrl } from "../utils.js";
import { SHL_SEASON, SHL_TEAMS, SHL_PLAYERS, SHL_ROUNDS, getGamesForRound, FANTASY_SCORING } from "../data/shlPlayers.js";

export async function openShlFantasyModal(options = {}) {
  const isEn = getLang() === "en";
  const currentUser = getStoredUser() || { nickname: "Du", avatar_emoji: "🏒" };
  const initialJoinCode = options.joinCode || options.leagueCode || null;

  // Real multiplayer league state
  let currentLeague = null; // Backend league object if in multiplayer room
  let isMultiplayer = false;
  let userFriends = [];
  try {
    if (isLoggedIn()) {
      userFriends = await getFriends();
    }
  } catch (e) {}

  let activeTab = "draft"; // draft, pot, live, rules
  let selectedStake = 50; // kr
  let selectedMode = "swish"; // "free" or "swish"
  let isLockedIn = false;
  let isSimulating = false;
  let roundSimulated = false;
  let isAddingPlayer = false;

  // Round selection state: Automatically select today's active round, next upcoming round, or default to Omgång 1
  function findDefaultRoundId() {
    if (options.roundId && SHL_ROUNDS.some(r => r.id === options.roundId)) {
      return options.roundId;
    }
    const today = new Date().toISOString().split('T')[0];
    // 1. Check if today matches any scheduled match day
    const todayRound = SHL_ROUNDS.find(r => r.days && r.days.some(d => d.date === today));
    if (todayRound) return todayRound.id;

    // 2. Check for upcoming round that has not locked yet
    const nowIso = new Date().toISOString();
    const upcomingRound = SHL_ROUNDS.find(r => {
      const lock = r.lockTime || (r.days?.[0]?.date ? `${r.days[0].date}T23:59:59` : null);
      return lock && lock >= nowIso;
    });
    if (upcomingRound) return upcomingRound.id;

    // 3. Fallback to first round in the schedule (Omgång 1)
    return SHL_ROUNDS[0]?.id || "omg_1";
  }
  let selectedRoundId = findDefaultRoundId();
  function getCurrentRound() {
    return SHL_ROUNDS.find(r => r.id === selectedRoundId) || SHL_ROUNDS[0];
  }
  let currentRound = getCurrentRound();
  let roundGames = getGamesForRound(currentRound);
  let currentSimulatedDay = 0; // 0 = not started, 1 = day 1 played, 2 = day 2 played

  // Load custom players from localStorage if any
  let customPlayers = [];
  try {
    const raw = localStorage.getItem("betpals_shl_custom_players");
    if (raw) customPlayers = JSON.parse(raw);
  } catch (e) {}

  let allPlayers = [...SHL_PLAYERS, ...customPlayers];

  function reloadAllPlayers() {
    allPlayers = [...SHL_PLAYERS, ...customPlayers];
  }

  // Selected lineup: 1 G, 2 D, 3 F
  let myLineup = {
    goalie: null,     // player object
    defenders: [],    // max 2
    forwards: []      // max 3
  };

  // Pos filter & team filter
  let activePosFilter = "all"; // all, G, D, F
  let activeTeamFilter = "all"; // all, FBK, FHC, etc.
  let searchQuery = "";

  // Competitor friend squads (for live tournament feel)
  let competitors = [
    {
      id: "friend_1",
      name: "Kalle",
      avatar: "🦁",
      paid: true,
      lineup: {
        goalie: allPlayers.find(p => p.id === "g_larmi") || allPlayers.find(p => p.pos === "G"),
        defenders: [
          allPlayers.find(p => p.id === "d_tommernes") || allPlayers.find(p => p.pos === "D"),
          allPlayers.find(p => p.id === "d_nygren") || allPlayers.find(p => p.pos === "D")
        ],
        forwards: [
          allPlayers.find(p => p.id === "f_tomasek") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_nygard") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_dahlen") || allPlayers.find(p => p.pos === "F")
        ]
      },
      points: 0,
      breakdown: []
    },
    {
      id: "friend_2",
      name: "Johan",
      avatar: "🍺",
      paid: true,
      lineup: {
        goalie: allPlayers.find(p => p.id === "g_soderstrom") || allPlayers.find(p => p.pos === "G"),
        defenders: [
          allPlayers.find(p => p.id === "d_pudas") || allPlayers.find(p => p.pos === "D"),
          allPlayers.find(p => p.id === "d_gustafsson") || allPlayers.find(p => p.pos === "D")
        ],
        forwards: [
          allPlayers.find(p => p.id === "f_lindberg") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_wallmark") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_friberg") || allPlayers.find(p => p.pos === "F")
        ]
      },
      points: 0,
      breakdown: []
    },
    {
      id: "friend_3",
      name: "Micke",
      avatar: "🔥",
      paid: true,
      lineup: {
        goalie: allPlayers.find(p => p.id === "g_clara") || allPlayers.find(p => p.pos === "G"),
        defenders: [
          allPlayers.find(p => p.id === "d_djoos") || allPlayers.find(p => p.pos === "D"),
          allPlayers.find(p => p.id === "d_niemela") || allPlayers.find(p => p.pos === "D")
        ],
        forwards: [
          allPlayers.find(p => p.id === "f_silfverberg") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_lindblom") || allPlayers.find(p => p.pos === "F"),
          allPlayers.find(p => p.id === "f_steen") || allPlayers.find(p => p.pos === "F")
        ]
      },
      points: 0,
      breakdown: []
    }
  ];

  // Live match events generator state
  function initLiveMatchResults() {
    return roundGames.map(g => ({
      ...g,
      homeScore: 0,
      awayScore: 0,
      period: g.time,
      status: "scheduled",
      events: []
    }));
  }
  let liveMatchResults = initLiveMatchResults();

  // Real-time WebSocket synchronization
  let wsUnsub = null;
  function setupLeagueWebSocket(code) {
    if (!code) return;
    if (wsUnsub) { wsUnsub(); wsUnsub = null; }
    connectWebSocket(`shl_${code}`);
    wsUnsub = onWebSocketMessage((msg) => {
      if (msg.type === "shl_league_updated" || msg.type === "shl_league_settled") {
        if (msg.league && msg.league.code === currentLeague?.code) {
          currentLeague = msg.league;
          const me = currentLeague.entries.find(e => e.user_id === currentUser.id);
          if (me) {
            if (me.lineup && (!myLineup.goalie && myLineup.defenders.length === 0)) {
              myLineup = me.lineup;
            }
            if (me.is_locked) {
              isLockedIn = true;
            }
          }
          if (currentLeague.simulation_data) {
            liveMatchResults = currentLeague.simulation_data.matches || [];
            currentSimulatedDay = currentLeague.simulation_data.currentDay || 0;
          }
          roundSimulated = currentLeague.status === "finished";
          refreshAll();
        }
      }
    });
  }

  // If initialJoinCode passed, load league immediately
  if (initialJoinCode) {
    try {
      const l = await getShlLeague(initialJoinCode);
      if (l) {
        currentLeague = l;
        isMultiplayer = true;
        selectedRoundId = l.round_id;
        currentRound = getCurrentRound();
        roundGames = getGamesForRound(currentRound);
        selectedStake = l.stake_amount;
        selectedMode = l.mode;
        if (l.simulation_data) {
          liveMatchResults = l.simulation_data.matches || [];
          currentSimulatedDay = l.simulation_data.currentDay || 0;
        }
        roundSimulated = l.status === "finished";
        const myEntry = l.entries.find(e => e.user_id === currentUser.id);
        if (myEntry && myEntry.lineup && myEntry.lineup.goalie) {
          myLineup = myEntry.lineup;
          isLockedIn = !!myEntry.is_locked;
        }
        setupLeagueWebSocket(l.code);
      }
    } catch (e) {
      showToast("Kunde inte ladda ligan: " + e.message, "error");
    }
  }

  const modalTitle = `<img src="/hockey-gold.png" alt="" style="width: 28px; height: 28px; object-fit: contain; vertical-align: -5px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" /> ${isEn ? "SHL 2026/2027 Mini Fantasy 🏒" : "SHL 2026/2027 Mini Fantasy 🏒"}`;

  function getTotalSelectedCount() {
    return (myLineup.goalie ? 1 : 0) + myLineup.defenders.length + myLineup.forwards.length;
  }

  function renderContent() {
    return `
      <div class="shl-fantasy-container" style="max-width: 480px; margin: 0 auto; text-align: left; user-select: none;">
        
        <!-- Round Selector & Multi-Day Schedule Strip -->
        <div class="card mb-xs" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(251,191,36,0.3); border-radius: var(--radius-md); padding: 8px 10px;">
          <div class="flex-between align-center">
            <div class="flex align-center gap-xs" style="flex: 1;">
              <span style="font-size: 1rem;">${isMultiplayer ? "🔒" : "🏒"}</span>
              <select id="shl-round-select" ${isMultiplayer ? 'disabled title="Omgången är låst till kompisligan"' : ""} style="background: transparent; color: var(--gold); font-weight: 800; font-size: 0.84rem; border: none; outline: none; cursor: ${isMultiplayer ? "default" : "pointer"}; max-width: 260px; opacity: ${isMultiplayer ? "0.9" : "1"};">
                ${SHL_ROUNDS.map(r => `
                  <option value="${r.id}" ${selectedRoundId === r.id ? "selected" : ""} style="background: #0f172a; color: #fff;">
                    ${r.name} (${r.dateRange}) ${isMultiplayer && selectedRoundId === r.id ? "🔒" : ""}
                  </option>
                `).join("")}
              </select>
            </div>
            <span class="badge ${currentRound.days.length > 1 ? "badge-warning" : "badge-accent"}" style="font-size: 0.68rem; font-weight: 700; white-space: nowrap;">
              ${currentRound.days.length > 1 ? `📅 ${currentRound.days.length} matchdagar` : "📅 1 matchdag"}
            </span>
          </div>

          <!-- Schedule summary by day -->
          <div style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 5px;">
            ${currentRound.days.map(d => `
              <div class="flex-between align-center py-xs" style="font-size: 0.7rem;">
                <span style="color: #fff; font-weight: 700;">📅 ${d.dayLabel}:</span>
                <span style="color: var(--text-secondary); text-align: right;">
                  ${d.games.map(g => `${g.home}-${g.away} (${g.time})`).join(" · ")}
                </span>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Multiplayer / Solo Switch Banner -->
        <div class="card mb-sm" style="background: ${isMultiplayer ? "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(16,185,129,0.1))" : "rgba(255,255,255,0.03)"}; border: 1px solid ${isMultiplayer ? "var(--gold)" : "var(--border-glass)"}; padding: 8px 10px; border-radius: var(--radius-md);">
          <div class="flex-between align-center">
            <div>
              <div style="font-size: 0.78rem; font-weight: 800; color: ${isMultiplayer ? "var(--gold)" : "#fff"}; display: flex; align-items: center; gap: 6px;">
                <span>${isMultiplayer ? "👥 KOMPIS-LIGA AKTIV" : "🎮 SOLO / TESTLÄGE"}</span>
                ${isMultiplayer ? `<span class="badge badge-accent" style="font-family: monospace; font-size: 0.7rem; font-weight: 900;">#${currentLeague.code}</span>` : ""}
              </div>
              <div style="font-size: 0.68rem; color: var(--text-secondary); margin-top: 2px;">
                ${isMultiplayer 
                  ? `${currentLeague.entries.length} deltagare anslutna · ${currentLeague.stake_amount} kr i Swish-pott`
                  : "Spela mot datormotståndare eller starta en riktig liga med kompisarna!"}
              </div>
            </div>

            <div class="flex gap-xs">
              ${isMultiplayer ? `
                <button type="button" class="btn btn-sm btn-secondary" id="btn-share-shl-league" style="font-size: 0.72rem; padding: 4px 8px; border-color: var(--gold); color: var(--gold); font-weight: 700;" title="Dela länk med vänner">
                  🔗 Bjud in
                </button>
              ` : `
                <button type="button" class="btn btn-sm btn-primary" id="btn-create-shl-league" style="font-size: 0.72rem; padding: 5px 10px; font-weight: 700;">
                  👥 Skapa Liga
                </button>
                <button type="button" class="btn btn-sm btn-ghost" id="btn-join-shl-league" style="font-size: 0.72rem; padding: 5px 8px; color: var(--text-secondary);">
                  Gå med
                </button>
              `}
            </div>
          </div>
        </div>

        <!-- Header Mode Tabs -->
        <div class="flex gap-xs mb-md" style="background: rgba(0,0,0,0.4); padding: 4px; border-radius: var(--radius-md); border: 1px solid var(--border-glass);">
          <button type="button" class="btn btn-sm ${activeTab === "draft" ? "btn-primary" : "btn-ghost"}" id="tab-shl-draft" style="flex: 1; font-weight: 700; font-size: 0.78rem; padding: 6px 2px;">
            🏒 ${isEn ? "Draft (6)" : "Draft (6)"}
          </button>
          <button type="button" class="btn btn-sm ${activeTab === "pot" ? "btn-primary" : "btn-ghost"}" id="tab-shl-pot" style="flex: 1; font-weight: 700; font-size: 0.78rem; padding: 6px 2px;">
            💰 ${isEn ? "Swish Pot" : "Swish-Pott"}
          </button>
          <button type="button" class="btn btn-sm ${activeTab === "live" ? "btn-primary" : "btn-ghost"}" id="tab-shl-live" style="flex: 1; font-weight: 700; font-size: 0.78rem; padding: 6px 2px;">
            ⚡ ${isEn ? "Live Round" : "Live-Rond"}
          </button>
          <button type="button" class="btn btn-sm ${activeTab === "rules" ? "btn-primary" : "btn-ghost"}" id="tab-shl-rules" style="flex: 0.8; font-weight: 700; font-size: 0.78rem; padding: 6px 2px;">
            📖 ${isEn ? "Rules" : "Regler"}
          </button>
        </div>

        <div id="shl-tab-body">
          ${activeTab === "draft" ? renderDraftTab() :
            activeTab === "pot" ? renderPotTab() :
            activeTab === "live" ? renderLiveTab() : renderRulesTab()}
        </div>

      </div>
    `;
  }

  // ── VIEW 1: DRAFT TAB ─────────────────────────────────────
  function renderDraftTab() {
    const selectedCount = getTotalSelectedCount();
    const isComplete = selectedCount === 6;

    // Filter players
    let filteredPlayers = allPlayers.filter(p => {
      if (activePosFilter !== "all" && p.pos !== activePosFilter) return false;
      if (activeTeamFilter !== "all" && p.team !== activeTeamFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q);
      }
      return true;
    });

    return `
      <!-- Lineup Slots Strip -->
      <div style="background: linear-gradient(135deg, rgba(251,191,36,0.1), rgba(16,185,129,0.08)); border: 1px solid rgba(251,191,36,0.3); border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 12px;">
        <div class="flex-between align-center mb-xs">
          <span style="font-size: 0.82rem; font-weight: 800; color: var(--gold); letter-spacing: 0.04em;">
            📋 ${isEn ? "YOUR 6-MAN SQUAD" : "DIN 6-MANNATRUPP"}
          </span>
          <span class="badge ${isComplete ? "badge-success" : "badge-accent"}" style="font-size: 0.75rem; font-weight: 800;">
            ${selectedCount} / 6 ${isEn ? "SELECTED" : "VALDA"}
          </span>
        </div>

        <!-- 6 Slots Display -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px;">
          <!-- Goalie (1) -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.goalie ? "#10b981" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #10b981; font-weight: 700; text-transform: uppercase;">🧤 Målvakt</div>
            ${myLineup.goalie ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.goalie.name.split(" ")[1] || myLineup.goalie.name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.goalie.team}</div>
              <button type="button" class="btn-remove-slot" data-slot="goalie" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj MV</div>
            `}
          </div>

          <!-- Defender 1 -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.defenders[0] ? "#3b82f6" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #3b82f6; font-weight: 700; text-transform: uppercase;">🛡️ Back 1</div>
            ${myLineup.defenders[0] ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.defenders[0].name.split(" ")[1] || myLineup.defenders[0].name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.defenders[0].team}</div>
              <button type="button" class="btn-remove-slot" data-slot="def_0" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj Back</div>
            `}
          </div>

          <!-- Defender 2 -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.defenders[1] ? "#3b82f6" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #3b82f6; font-weight: 700; text-transform: uppercase;">🛡️ Back 2</div>
            ${myLineup.defenders[1] ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.defenders[1].name.split(" ")[1] || myLineup.defenders[1].name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.defenders[1].team}</div>
              <button type="button" class="btn-remove-slot" data-slot="def_1" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj Back</div>
            `}
          </div>

          <!-- Forward 1 -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.forwards[0] ? "#f59e0b" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #f59e0b; font-weight: 700; text-transform: uppercase;">🏒 Forward 1</div>
            ${myLineup.forwards[0] ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.forwards[0].name.split(" ")[1] || myLineup.forwards[0].name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.forwards[0].team}</div>
              <button type="button" class="btn-remove-slot" data-slot="fwd_0" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj Fwd</div>
            `}
          </div>

          <!-- Forward 2 -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.forwards[1] ? "#f59e0b" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #f59e0b; font-weight: 700; text-transform: uppercase;">🏒 Forward 2</div>
            ${myLineup.forwards[1] ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.forwards[1].name.split(" ")[1] || myLineup.forwards[1].name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.forwards[1].team}</div>
              <button type="button" class="btn-remove-slot" data-slot="fwd_1" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj Fwd</div>
            `}
          </div>

          <!-- Forward 3 -->
          <div class="slot-box" style="background: rgba(0,0,0,0.4); border: 1px dashed ${myLineup.forwards[2] ? "#f59e0b" : "rgba(255,255,255,0.2)"}; border-radius: 6px; padding: 6px; text-align: center; position: relative;">
            <div style="font-size: 0.65rem; color: #f59e0b; font-weight: 700; text-transform: uppercase;">🏒 Forward 3</div>
            ${myLineup.forwards[2] ? `
              <div style="font-size: 0.75rem; font-weight: 700; color: #fff; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${myLineup.forwards[2].name.split(" ")[1] || myLineup.forwards[2].name}
              </div>
              <div style="font-size: 0.65rem; color: var(--gold);">${myLineup.forwards[2].team}</div>
              <button type="button" class="btn-remove-slot" data-slot="fwd_2" style="position: absolute; top: 2px; right: 4px; background: none; border: none; color: #ef4444; font-size: 0.75rem; cursor: pointer;">✕</button>
            ` : `
              <div style="font-size: 0.7rem; color: rgba(255,255,255,0.4); margin-top: 4px;">+ Välj Fwd</div>
            `}
          </div>
        </div>

        ${isComplete ? `
          <button type="button" class="btn ${isLockedIn ? "btn-secondary" : "btn-success"} btn-sm mt-sm w-100" id="btn-lock-squad" style="font-weight: 800; padding: 10px; font-size: 0.88rem; ${isLockedIn ? "border-color: rgba(255,255,255,0.25); color: var(--gold);" : "background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 12px rgba(16,185,129,0.4);"}">
            ${isLockedIn ? `🔒 ${isEn ? "SQUAD LOCKED (TAP TO UNLOCK)" : "LAGET ÄR LÅST (KLICKA FÖR ATT LÅSA UPP)"}` : `🔒 ${isEn ? "LOCK IN SQUAD & JOIN POT" : "LÅS LAGET & GÅ TILL POTTEN"}`}
          </button>
        ` : ""}
      </div>

      <!-- Filters & Search -->
      <div class="mb-sm">
        <div class="flex gap-xs mb-xs">
          <!-- Position pills -->
          <button type="button" class="btn btn-xs ${activePosFilter === "all" ? "btn-secondary" : "btn-ghost"} pos-pill" data-pos="all">Alla</button>
          <button type="button" class="btn btn-xs ${activePosFilter === "G" ? "btn-secondary" : "btn-ghost"} pos-pill" data-pos="G">🧤 Målvakter</button>
          <button type="button" class="btn btn-xs ${activePosFilter === "D" ? "btn-secondary" : "btn-ghost"} pos-pill" data-pos="D">🛡️ Backar</button>
          <button type="button" class="btn btn-xs ${activePosFilter === "F" ? "btn-secondary" : "btn-ghost"} pos-pill" data-pos="F">🏒 Forwards</button>
        </div>

        <div class="flex gap-xs">
          <!-- Team Select -->
          <select id="shl-team-select" style="background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 5px 8px; font-size: 0.8rem; flex: 1;">
            <option value="all">${isEn ? "All 14 SHL Teams" : "Alla 14 SHL-Lag"}</option>
            ${SHL_TEAMS.map(t => `<option value="${t.short}" ${activeTeamFilter === t.short ? "selected" : ""}>${t.name} (${t.city})</option>`).join("")}
          </select>
          <!-- Search input -->
          <input type="text" id="shl-search-input" placeholder="${isEn ? "Search player..." : "Sök spelare..."}" value="${escapeHtml(searchQuery)}" style="background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 5px 8px; font-size: 0.8rem; flex: 1.2;" />
        </div>

        <!-- Action bar: Count + Add missing player + Reset -->
        <div class="flex-between align-center mt-xs" style="font-size: 0.72rem; padding: 2px 2px;">
          <span style="color: var(--text-secondary);">
            Visar <strong style="color: #fff;">${filteredPlayers.length}</strong> spelare (av ${allPlayers.length})
          </span>
          <div class="flex gap-xs">
            <button type="button" class="btn btn-xs ${isAddingPlayer ? "btn-secondary" : "btn-ghost"}" id="btn-toggle-add-player" style="padding: 2px 8px; font-size: 0.72rem; color: var(--gold); border: 1px dashed rgba(255,215,0,0.4);">
              ${isAddingPlayer ? "✕ Avbryt" : "➕ Lägg till spelare"}
            </button>
            ${customPlayers.length > 0 ? `
              <button type="button" class="btn btn-xs btn-ghost text-danger" id="btn-reset-custom-players" style="padding: 2px 6px; font-size: 0.7rem;" title="Rensa egna tillagda spelare">
                🔄 Rensa (${customPlayers.length})
              </button>
            ` : ""}
          </div>
        </div>

        <!-- Inline Add Player Form -->
        ${isAddingPlayer ? `
          <div class="card my-xs" style="background: rgba(15, 23, 42, 0.95); border: 1px solid var(--gold); border-radius: 8px; padding: 10px;">
            <div style="font-size: 0.78rem; font-weight: 800; color: var(--gold); margin-bottom: 6px;">
              ➕ Skapa / Lägg till spelare i SHL 2026/2027
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <input type="text" id="new-player-name" placeholder="Spelarens namn (t.ex. Lucas Wallmark)" style="background: rgba(0,0,0,0.6); color: #fff; border: 1px solid var(--border-glass); border-radius: 4px; padding: 6px 8px; font-size: 0.8rem;" />
              <div class="flex gap-xs">
                <select id="new-player-team" style="flex: 1.2; background: #0f172a; color: #fff; border: 1px solid var(--border-glass); border-radius: 4px; padding: 5px; font-size: 0.78rem;">
                  ${SHL_TEAMS.map(t => `<option value="${t.short}">${t.name} (${t.short})</option>`).join("")}
                </select>
                <select id="new-player-pos" style="flex: 1; background: #0f172a; color: #fff; border: 1px solid var(--border-glass); border-radius: 4px; padding: 5px; font-size: 0.78rem;">
                  <option value="G">🧤 Målvakt</option>
                  <option value="D">🛡️ Back</option>
                  <option value="F" selected>🏒 Forward</option>
                </select>
                <input type="number" id="new-player-num" placeholder="Nr" value="10" min="1" max="99" style="width: 50px; background: rgba(0,0,0,0.6); color: #fff; border: 1px solid var(--border-glass); border-radius: 4px; padding: 5px; font-size: 0.78rem; text-align: center;" />
              </div>
              <div class="flex-between align-center mt-xs">
                <span style="font-size: 0.7rem; color: var(--text-secondary);">Sparas direkt i din trupp</span>
                <button type="button" class="btn btn-xs btn-primary font-bold" id="btn-submit-new-player" style="padding: 4px 10px; font-size: 0.75rem;">
                  Spara & Välj direkt 🏒
                </button>
              </div>
            </div>
          </div>
        ` : ""}
      </div>

      <!-- Players List -->
      <div class="shl-players-list" style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px;">
        ${filteredPlayers.map(p => {
          const isSelected = isPlayerSelected(p.id);
          const posBadgeColor = p.pos === "G" ? "#10b981" : p.pos === "D" ? "#3b82f6" : "#f59e0b";
          
          // Find player's match in this round
          let playerGame = null;
          let playerGameDay = null;
          for (const day of currentRound.days) {
            const found = day.games.find(g => g.home === p.team || g.away === p.team);
            if (found) {
              playerGame = found;
              playerGameDay = day;
              break;
            }
          }

          const matchInfoStr = playerGame 
            ? `🕒 ${playerGameDay.dayLabel.split(" ")[0]} ${playerGame.time} (${playerGame.home === p.team ? "vs " + playerGame.away : "@ " + playerGame.home})`
            : "⚠️ Spelledig";

          return `
            <div class="player-card-item flex-between align-center" style="background: rgba(255,255,255,0.03); border: 1px solid ${isSelected ? "var(--gold)" : "var(--border-glass)"}; border-radius: var(--radius-sm); padding: 8px 10px;">
              <div class="flex align-center gap-sm">
                <span style="background: rgba(0,0,0,0.4); border: 1px solid ${posBadgeColor}; color: ${posBadgeColor}; font-weight: 800; font-size: 0.7rem; width: 22px; height: 22px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center;">
                  ${p.pos}
                </span>
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem; color: #fff;">
                    #${p.num} ${escapeHtml(p.name)}
                  </div>
                  <div class="flex gap-xs" style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 1px; flex-wrap: wrap;">
                    <span class="text-gold font-bold">${p.team}</span> ·
                    <span style="color: ${playerGame ? "rgba(255,255,255,0.8)" : "#ef4444"}; font-weight: 600;">${matchInfoStr}</span> ·
                    <span>⭐ ${p.form}</span>
                  </div>
                </div>
              </div>

              <div>
                ${isSelected ? `
                  <button type="button" class="btn btn-danger btn-xs btn-toggle-player" data-player-id="${p.id}" style="padding: 4px 8px; font-size: 0.75rem;">
                    ✕ Ta bort
                  </button>
                ` : `
                  <button type="button" class="btn btn-secondary btn-xs btn-toggle-player" data-player-id="${p.id}" style="padding: 4px 10px; font-size: 0.75rem; border-color: rgba(255,215,0,0.5); color: var(--gold);">
                    + Välj
                  </button>
                `}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function isPlayerSelected(playerId) {
    if (myLineup.goalie?.id === playerId) return true;
    if (myLineup.defenders.some(d => d.id === playerId)) return true;
    if (myLineup.forwards.some(f => f.id === playerId)) return true;
    return false;
  }

  // ── VIEW 2: SWISH & POT TAB ───────────────────────────────
  function renderPotTab() {
    const participants = isMultiplayer ? currentLeague.entries : [
      {
        id: "me",
        user_name: `${currentUser.nickname || "Du"} (Du)`,
        avatar_emoji: currentUser.avatar_emoji || "👤",
        swish_number: currentUser.swish_number || "",
        lineup: myLineup
      },
      ...competitors.map(c => ({
        id: c.id,
        user_name: c.name,
        avatar_emoji: c.avatar,
        swish_number: "0701234567",
        lineup: c.lineup
      }))
    ];

    const completedParticipants = participants.filter(p => {
      const pCount = (p.lineup?.goalie ? 1 : 0) + (p.lineup?.defenders?.length || 0) + (p.lineup?.forwards?.length || 0);
      return pCount === 6;
    });

    const activeStake = isMultiplayer ? currentLeague.stake_amount : selectedStake;
    const activeMode = isMultiplayer ? currentLeague.mode : selectedMode;
    const totalPot = activeMode === "swish" ? completedParticipants.length * activeStake : 0;

    return `
      <div style="padding: 4px 0;">
        <div class="card mb-md" style="background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(16,185,129,0.1)); border: 1px solid var(--gold); padding: 14px; text-align: center;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
            💰 ${isEn ? "TOTAL PRIZE POT" : "TOTALA POTTEN"}
          </div>
          <div style="font-family: var(--font-heading); font-size: 1.8rem; font-weight: 900; color: var(--gold); margin: 4px 0;">
            ${activeMode === "swish" ? `${totalPot} KR` : "ÄRAN & SKRYT 🪙"}
          </div>
          <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">
            ${completedParticipants.length} ${isEn ? "complete squads" : "klara lag i potten"} (${activeStake} kr / pers)
          </div>
        </div>

        ${!isMultiplayer ? `
          <!-- Stake Selector (Solo/Test) -->
          <div class="mb-md">
            <label style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); display: block; margin-bottom: 6px;">
              💵 ${isEn ? "Choose Stake per Person:" : "Välj insats per person:"}
            </label>
            <div class="flex gap-xs mb-sm">
              <button type="button" class="btn btn-sm stake-btn ${selectedMode === "free" ? "active" : ""}" data-mode="free" style="flex: 1; font-size: 0.78rem; padding: 8px 4px; ${selectedMode === "free" ? "border-color: #10b981; color: #10b981;" : ""}">
                🪙 Gratis
              </button>
              <button type="button" class="btn btn-sm stake-btn ${selectedMode === "swish" && selectedStake === 20 ? "active" : ""}" data-mode="swish" data-stake="20" style="flex: 1; font-size: 0.78rem; padding: 8px 4px; ${selectedMode === "swish" && selectedStake === 20 ? "border-color: var(--gold); color: var(--gold);" : ""}">
                20 kr
              </button>
              <button type="button" class="btn btn-sm stake-btn ${selectedMode === "swish" && selectedStake === 50 ? "active" : ""}" data-mode="swish" data-stake="50" style="flex: 1; font-size: 0.78rem; padding: 8px 4px; ${selectedMode === "swish" && selectedStake === 50 ? "border-color: var(--gold); color: var(--gold);" : ""}">
                50 kr 🔥
              </button>
              <button type="button" class="btn btn-sm stake-btn ${selectedMode === "swish" && selectedStake === 100 ? "active" : ""}" data-mode="swish" data-stake="100" style="flex: 1; font-size: 0.78rem; padding: 8px 4px; ${selectedMode === "swish" && selectedStake === 100 ? "border-color: var(--gold); color: var(--gold);" : ""}">
                100 kr
              </button>
            </div>
          </div>
        ` : ""}

        <!-- Participants List -->
        <div class="card mb-md" style="padding: 10px 12px; background: rgba(0,0,0,0.3);">
          <div class="flex-between mb-xs align-center">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold);">
              👥 ${isMultiplayer ? `Kompisar i ligan (${participants.length}):` : `Kompisar i potten:`}
            </span>
            <span class="badge badge-success" style="font-size: 0.65rem;">KLARA FÖR NEDSLÄPP 🏒</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${participants.map(p => {
              const pCount = (p.lineup?.goalie ? 1 : 0) + (p.lineup?.defenders?.length || 0) + (p.lineup?.forwards?.length || 0);
              const isMe = p.user_id === currentUser.id || p.id === "me";
              return `
                <div class="flex-between align-center py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.82rem;">
                  <div class="flex align-center gap-xs">
                    <span>${p.avatar_emoji || "🏒"}</span>
                    <span style="color: ${isMe ? "#10b981" : "#fff"}; font-weight: ${isMe ? "700" : "600"};">
                      ${escapeHtml(p.user_name || p.name)} ${isMe ? "(Du)" : ""}
                    </span>
                    ${p.swish_number ? `<span class="badge" style="font-size: 0.65rem; background: rgba(255,255,255,0.08); padding: 1px 4px;">📱 ${p.swish_number}</span>` : ""}
                  </div>
                  <span style="color: ${pCount === 6 ? "#10b981" : "var(--gold)"}; font-size: 0.75rem; font-weight: 700;">
                    ${pCount === 6 ? "✓ 6/6 klara" : `${pCount}/6 valda`}
                  </span>
                </div>
              `;
            }).join("")}
          </div>

          ${isMultiplayer ? `
            <div class="flex gap-xs mt-sm">
              <button type="button" class="btn btn-sm btn-secondary w-100" id="btn-pot-invite-friends" style="font-size: 0.75rem; font-weight: 700; border-color: var(--gold); color: var(--gold);">
                📲 Bjud in fler vänner till ligan
              </button>
            </div>
          ` : ""}
        </div>

        <button type="button" class="btn btn-primary w-100" id="btn-go-to-live" style="font-weight: 800; padding: 12px; font-size: 0.95rem;">
          ⚡ ${isEn ? "GO TO LIVE ROUND" : "FÖLJ LIVE-OMGÅNGEN"}
        </button>
      </div>
    `;
  }

  // ── VIEW 3: LIVE ROUND & LEADERBOARD ─────────────────────
  function renderLiveTab() {
    let allSquads = [];

    if (isMultiplayer) {
      allSquads = currentLeague.entries.map(e => ({
        id: e.user_id,
        name: e.user_name,
        avatar: e.avatar_emoji || "🏒",
        swish: e.swish_number || "",
        points: typeof e.points === "number" ? e.points : calculateLineupPoints(e.lineup || {}),
        lineup: e.lineup || { goalie: null, defenders: [], forwards: [] },
        isPaid: !!e.is_paid,
        isMe: e.user_id === currentUser.id
      }));
    } else {
      const myTotalPoints = calculateLineupPoints(myLineup);
      allSquads = [
        {
          id: currentUser.id || "me",
          name: `${currentUser.nickname || "Du"} (Ditt lag)`,
          avatar: currentUser.avatar_emoji || "👑",
          swish: currentUser.swish_number || "0701234567",
          points: myTotalPoints,
          lineup: myLineup,
          isPaid: true,
          isMe: true
        },
        ...competitors.map(c => ({
          id: c.id,
          name: c.name,
          avatar: c.avatar,
          swish: "0709876543",
          points: c.points,
          lineup: c.lineup,
          isPaid: false,
          isMe: false
        }))
      ];
    }

    allSquads.sort((a, b) => b.points - a.points);
    const leader = allSquads[0] || { name: "Ingen", points: 0 };
    const totalDays = currentRound.days.length;
    const isRoundComplete = currentSimulatedDay >= totalDays || (isMultiplayer && currentLeague.status === "finished");
    const activeStake = isMultiplayer ? currentLeague.stake_amount : selectedStake;
    const activeMode = isMultiplayer ? currentLeague.mode : selectedMode;
    const totalPot = activeMode === "swish" ? allSquads.length * activeStake : 0;

    let simBtnLabel = "⚡ Simulera Mål!";
    if (totalDays > 1) {
      if (currentSimulatedDay === 0) {
        simBtnLabel = `⚡ Simulera Dag 1 (${currentRound.days[0].dayLabel.split(" ")[0]})`;
      } else if (currentSimulatedDay < totalDays) {
        simBtnLabel = `⚡ Simulera Dag ${currentSimulatedDay + 1} (${currentRound.days[currentSimulatedDay].dayLabel.split(" ")[0]})`;
      } else {
        simBtnLabel = "🔄 Återställ Omgång";
      }
    } else {
      simBtnLabel = isRoundComplete ? "🔄 Kör igen" : "⚡ Simulera Mål!";
    }

    let statusText = "OMGÅNG PÅGÅR";
    let statusDesc = "Matcher i full gång!";
    if (isRoundComplete) {
      statusText = "OMGÅNG AVSLUTAD 🏆";
      statusDesc = `Alla matcher färdigspelade!`;
    } else if (currentSimulatedDay > 0) {
      statusText = `DAG ${currentSimulatedDay} AVKLARAD ⏳`;
      statusDesc = `Dag ${currentSimulatedDay} klar, väntar på nästa matchdag`;
    }

    return `
      <div style="padding: 4px 0;">
        
        <!-- Action bar / simulation button -->
        <div class="flex-between align-center mb-sm" style="background: rgba(0,0,0,0.35); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-glass);">
          <div>
            <div style="font-size: 0.8rem; font-weight: 800; color: ${isRoundComplete ? "#fbbf24" : "#10b981"}; display: flex; align-items: center; gap: 4px;">
              <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: ${isRoundComplete ? "#fbbf24" : "#10b981"}; box-shadow: 0 0 8px ${isRoundComplete ? "#fbbf24" : "#10b981"};"></span>
              ${statusText}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 1px;">
              ${statusDesc}
            </div>
          </div>

          ${(!isMultiplayer || currentLeague.creator_id === currentUser.id) ? `
            <button type="button" class="btn btn-sm btn-secondary" id="btn-simulate-round" style="font-size: 0.75rem; padding: 6px 10px; font-weight: 700; border-color: var(--gold); color: var(--gold);">
              ${simBtnLabel}
            </button>
          ` : `
            <div style="font-size: 0.72rem; color: var(--gold); font-weight: 700;">
              ${isRoundComplete ? "Avgjord 🏆" : "Väntar på skaparen ⏳"}
            </div>
          `}
        </div>

        <!-- Leaderboard -->
        <div class="mb-md">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--gold); margin-bottom: 6px; letter-spacing: 0.04em;">
            👑 ${isEn ? "FRIENDS LIVE STANDINGS:" : "KOMPIS-LIGAN LIVE:"}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${allSquads.map((sq, rank) => {
              const isFirst = rank === 0 && sq.points > 0;
              return `
                <div class="card" style="padding: 10px 12px; background: ${isFirst ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(16,185,129,0.08))" : "rgba(255,255,255,0.02)"}; border: 1px solid ${isFirst ? "var(--gold)" : sq.isMe ? "rgba(16,185,129,0.4)" : "var(--border-glass)"};">
                  <div class="flex-between align-center">
                    <div class="flex align-center gap-xs">
                      <span style="font-weight: 900; font-size: 1rem; width: 22px; color: ${rank === 0 ? "var(--gold)" : "var(--text-secondary)"};">
                        ${rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`}
                      </span>
                      <span style="font-size: 1.1rem;">${sq.avatar}</span>
                      <div>
                        <div style="font-weight: 700; font-size: 0.88rem; color: ${sq.isMe ? "#10b981" : "#fff"};">
                          ${escapeHtml(sq.name)} ${sq.isMe ? "(Du)" : ""}
                        </div>
                        ${sq.swish ? `<div style="font-size: 0.65rem; color: var(--text-secondary);">📱 ${escapeHtml(sq.swish)}</div>` : ""}
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <span style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 900; color: var(--gold);">
                        ${sq.points}p
                      </span>
                    </div>
                  </div>

                  <!-- Mini squad points detail -->
                  <div class="mt-xs" style="font-size: 0.68rem; color: rgba(255,255,255,0.6); display: flex; gap: 6px; flex-wrap: wrap;">
                    ${sq.lineup?.goalie ? `<span>🧤 ${escapeHtml(sq.lineup.goalie.name?.split(" ")[1] || sq.lineup.goalie.name)} (${sq.lineup.goalie.pts || 0}p)</span> · ` : ""}
                    ${(sq.lineup?.defenders || []).map(d => `<span>🛡️ ${escapeHtml(d.name?.split(" ")[1] || d.name)} (${d.pts || 0}p)</span>`).join(" · ")} ·
                    ${(sq.lineup?.forwards || []).map(f => `<span>🏒 ${escapeHtml(f.name?.split(" ")[1] || f.name)} (${f.pts || 0}p)</span>`).join(" · ")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- Real Swish Settlement Section if round finished -->
        ${isRoundComplete && activeMode === "swish" ? `
          <div class="card mb-md" style="background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(251,191,36,0.15)); border: 2px solid #10b981; padding: 14px;">
            <div style="text-align: center; margin-bottom: 12px;">
              <div style="font-size: 1.8rem; margin-bottom: 2px;">🏆</div>
              <div style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 800; color: #10b981; margin-bottom: 2px;">
                ${escapeHtml(leader.name)} VANN OMGÅNGEN!
              </div>
              <div style="font-size: 0.85rem; color: #fff;">
                Tar hem hela potten på <strong class="text-gold">${totalPot} kr</strong>!
              </div>
            </div>

            <!-- Settlement Transfers -->
            <div style="background: rgba(0,0,0,0.4); border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: 12px;">
              <div style="font-size: 0.72rem; font-weight: 800; color: var(--gold); margin-bottom: 6px; text-transform: uppercase;">
                📱 Swish-avräkning till vinnaren:
              </div>
              
              <div style="display: flex; flex-direction: column; gap: 6px;">
                ${allSquads.filter(sq => sq.id !== leader.id).map(loser => {
                  const winnerSwish = leader.swish || "0701234567";
                  const swishMsg = `SHL Fantasy ${currentRound.name} - ${loser.name}`;
                  const swishUrl = createSwishUrl({
                    phone: winnerSwish,
                    amount: activeStake,
                    message: swishMsg
                  });

                  return `
                    <div class="flex-between align-center" style="padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 0.78rem;">
                      <div>
                        <span style="font-weight: 700; color: #fff;">${escapeHtml(loser.name)}</span>
                        <div style="font-size: 0.68rem; color: var(--text-secondary);">
                          Ska swisha ${activeStake} kr → ${escapeHtml(leader.name)}
                        </div>
                      </div>

                      <div class="flex align-center gap-xs">
                        ${loser.isPaid ? `
                          <span class="badge badge-success" style="font-size: 0.65rem; padding: 3px 6px;">Betald ✅</span>
                        ` : `
                          ${loser.isMe ? `
                            <a href="${swishUrl}" class="btn btn-sm btn-success" style="font-size: 0.7rem; padding: 4px 8px; text-decoration: none; font-weight: 700;">
                              📱 Swisha ${activeStake} kr
                            </a>
                          ` : `
                            <span class="badge badge-warning" style="font-size: 0.65rem;">Väntar</span>
                          `}
                        `}

                        ${(leader.isMe || loser.isMe || !isMultiplayer) ? `
                          <button type="button" class="btn btn-xs ${loser.isPaid ? "btn-ghost" : "btn-secondary"} btn-toggle-shl-paid" data-user-id="${loser.id}" data-is-paid="${loser.isPaid ? "0" : "1"}" style="font-size: 0.68rem; padding: 3px 6px;">
                            ${loser.isPaid ? "Ångra" : "Kvitto ✓"}
                          </button>
                        ` : ""}
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            </div>

            <!-- Share results to friends chat -->
            <button type="button" class="btn btn-secondary btn-sm w-100" id="btn-copy-shl-results" style="font-weight: 700; font-size: 0.8rem; padding: 8px;">
              📋 Kopiera resultat & Swish till kompis-chatten
            </button>
          </div>
        ` : ""}

        <!-- Matches list grouped by day -->
        <div class="mt-md">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">
            🏒 ${isEn ? "ROUND MATCHES & RESULTS:" : "OMGÅNGENS MATCHER & RESULTAT:"}
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${currentRound.days.map((d, dIdx) => {
              const isDayDone = currentSimulatedDay > dIdx;
              const isDayLive = currentSimulatedDay === dIdx;
              return `
                <div style="background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 8px;">
                  <div class="flex-between align-center mb-xs" style="font-size: 0.72rem; font-weight: 700; color: var(--gold);">
                    <span>📅 ${d.dayLabel}</span>
                    <span style="font-size: 0.65rem; color: ${isDayDone ? "#10b981" : isDayLive ? "#fbbf24" : "var(--text-secondary)"};">
                      ${isDayDone ? "✅ Färdigspelad" : isDayLive ? "🟡 Pågår" : "⏳ Kommande"}
                    </span>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    ${d.games.map(g => {
                      const liveM = liveMatchResults.find(m => m.id === g.id) || g;
                      return `
                        <div class="flex-between align-center" style="padding: 4px 8px; background: rgba(255,255,255,0.02); border-radius: 4px; font-size: 0.75rem;">
                          <span>${liveM.name}</span>
                          <span style="font-family: monospace; font-weight: 800; color: ${liveM.status === "finished" ? "var(--gold)" : "var(--text-secondary)"};">
                            ${liveM.status === "scheduled" ? liveM.time : `${liveM.homeScore} – ${liveM.awayScore} (Slut)`}
                          </span>
                        </div>
                      `;
                    }).join("")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

      </div>
    `;
  }

  function calculateLineupPoints(lineup) {
    let pts = 0;
    if (lineup?.goalie?.pts) pts += lineup.goalie.pts;
    (lineup?.defenders || []).forEach(d => { if (d?.pts) pts += d.pts; });
    (lineup?.forwards || []).forEach(f => { if (f?.pts) pts += f.pts; });
    return pts;
  }

  // ── VIEW 4: RULES & SCORING MATRIX ────────────────────────
  function renderRulesTab() {
    return `
      <div style="padding: 4px 0; font-size: 0.82rem; line-height: 1.45;">
        <div class="card mb-sm" style="padding: 12px; background: rgba(0,0,0,0.3); border-left: 3px solid var(--gold);">
          <div style="font-weight: 800; color: var(--gold); margin-bottom: 4px;">
            🎯 ${isEn ? "Quick Format:" : "Formatet:"}
          </div>
          <p class="text-secondary" style="margin: 0; font-size: 0.78rem;">
            ${isEn 
              ? "Draft 1 Goalie, 2 Defenders and 3 Forwards from tonight SHL round before 19:00. Compete against your friends for the Swish pot!" 
              : "Välj 1 Målvakt, 2 Backar och 3 Forwards inför kvällens omgång före nedsläpp kl 19:00. Tävla med kompisarna om kvällens Swish-pott!"}
          </p>
        </div>

        <div class="card mb-sm" style="padding: 12px;">
          <div style="font-weight: 800; color: #10b981; margin-bottom: 6px;">
            🧤 ${isEn ? "Goalie Scoring:" : "Målvaktspoäng:"}
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Lagseger</span>
            <span class="text-gold font-bold">+4p</span>
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Hållen nolla (Shutout)</span>
            <span class="text-gold font-bold">+5p</span>
          </div>
          <div class="flex-between py-xs">
            <span>Insläppt mål</span>
            <span class="text-danger font-bold">-1p</span>
          </div>
        </div>

        <div class="card mb-sm" style="padding: 12px;">
          <div style="font-weight: 800; color: #3b82f6; margin-bottom: 6px;">
            🛡️ ${isEn ? "Defender Scoring:" : "Backpoäng:"}
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Mål</span>
            <span class="text-gold font-bold">+4p</span>
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Assist</span>
            <span class="text-gold font-bold">+2p</span>
          </div>
          <div class="flex-between py-xs">
            <span>Plus/Minus</span>
            <span class="text-gold font-bold">+1p / -1p</span>
          </div>
        </div>

        <div class="card" style="padding: 12px;">
          <div style="font-weight: 800; color: #f59e0b; margin-bottom: 6px;">
            🏒 ${isEn ? "Forward Scoring:" : "Forwardspoäng:"}
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Mål</span>
            <span class="text-gold font-bold">+3p</span>
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Assist</span>
            <span class="text-gold font-bold">+2p</span>
          </div>
          <div class="flex-between py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <span>Matchvinnande mål (GWG)</span>
            <span class="text-gold font-bold">+2p</span>
          </div>
          <div class="flex-between py-xs">
            <span>Hattrick-bonus</span>
            <span class="text-gold font-bold">+3p</span>
          </div>
        </div>
      </div>
    `;
  }

  // ── MOUNT MODAL ───────────────────────────────────────────
  const { close, root, setBusy } = showModal(modalTitle, renderContent(), () => {
    if (wsUnsub) {
      wsUnsub();
      wsUnsub = null;
    }
  });

  // Prevent accidental close during active fantasy draft/round
  setBusy(
    () => getTotalSelectedCount() > 0 || roundSimulated,
    {
      title: isEn ? 'Leave SHL Fantasy? 🏒' : 'Lämna SHL Fantasy? 🏒',
      message: isEn
        ? 'You have an active lineup or round in progress. If you close now, your selected players will not be saved!'
        : 'Du har påbörjat en laguppställning eller matchomgång. Om du stänger nu sparas inte dina valda spelare!',
      stay: isEn ? 'Keep Building 🏒' : 'Fortsätt bygga lag 🏒',
      leave: isEn ? 'Yes, Close' : 'Ja, stäng och nollställ ❌'
    }
  );

  function refresh() {
    const body = root.querySelector("#shl-tab-body");
    if (body) {
      body.innerHTML = activeTab === "draft" ? renderDraftTab() :
                       activeTab === "pot" ? renderPotTab() :
                       activeTab === "live" ? renderLiveTab() : renderRulesTab();
      attachTabListeners();
    }
  }

  function attachTabListeners() {
    // Re-bind modal close button and backdrop click
    root.querySelector("#modal-close-btn")?.addEventListener("click", close);
    root.querySelector("#modal-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") close();
    });

    // Round selector
    const roundSelect = root.querySelector("#shl-round-select");
    roundSelect?.addEventListener("change", () => {
      selectedRoundId = roundSelect.value;
      currentRound = getCurrentRound();
      roundGames = getGamesForRound(currentRound);
      currentSimulatedDay = 0;
      roundSimulated = false;
      liveMatchResults = initLiveMatchResults();
      // Reset points on players
      const resetPts = (p) => { if (p) delete p.pts; };
      if (myLineup.goalie) resetPts(myLineup.goalie);
      myLineup.defenders.forEach(resetPts);
      myLineup.forwards.forEach(resetPts);
      competitors.forEach(c => {
        if (c.lineup.goalie) resetPts(c.lineup.goalie);
        c.lineup.defenders.forEach(resetPts);
        c.lineup.forwards.forEach(resetPts);
        c.points = 0;
      });
      refreshAll();
    });

    // Tab buttons
    root.querySelector("#tab-shl-draft")?.addEventListener("click", () => { activeTab = "draft"; refreshAll(); });
    root.querySelector("#tab-shl-pot")?.addEventListener("click", () => { activeTab = "pot"; refreshAll(); });
    root.querySelector("#tab-shl-live")?.addEventListener("click", () => { activeTab = "live"; refreshAll(); });
    root.querySelector("#tab-shl-rules")?.addEventListener("click", () => { activeTab = "rules"; refreshAll(); });

    // Draft tab actions
    if (activeTab === "draft") {
      // Position filter
      root.querySelectorAll(".pos-pill").forEach(btn => {
        btn.addEventListener("click", () => {
          activePosFilter = btn.dataset.pos;
          refresh();
        });
      });

      // Team filter
      const teamSelect = root.querySelector("#shl-team-select");
      teamSelect?.addEventListener("change", () => {
        activeTeamFilter = teamSelect.value;
        refresh();
      });

      // Search
      const searchInput = root.querySelector("#shl-search-input");
      searchInput?.addEventListener("input", () => {
        searchQuery = searchInput.value;
        refresh();
      });

      // Remove player from slot
      root.querySelectorAll(".btn-remove-slot").forEach(btn => {
        btn.addEventListener("click", () => {
          if (isLockedIn || (isMultiplayer && (currentLeague?.status === "finished" || (currentLeague?.simulation_data && currentLeague?.simulation_data?.currentDay > 0)))) {
            showToast("Laget är låst! Lås upp truppen först för att göra ändringar.", "error");
            return;
          }
          const slot = btn.dataset.slot;
          if (slot === "goalie") myLineup.goalie = null;
          else if (slot === "def_0") myLineup.defenders.splice(0, 1);
          else if (slot === "def_1") myLineup.defenders.splice(1, 1);
          else if (slot === "fwd_0") myLineup.forwards.splice(0, 1);
          else if (slot === "fwd_1") myLineup.forwards.splice(1, 1);
          else if (slot === "fwd_2") myLineup.forwards.splice(2, 1);
          refresh();
        });
      });

      // Toggle inline add player
      root.querySelector("#btn-toggle-add-player")?.addEventListener("click", () => {
        isAddingPlayer = !isAddingPlayer;
        refresh();
      });

      // Reset custom players
      root.querySelector("#btn-reset-custom-players")?.addEventListener("click", () => {
        if (confirm("Vill du ta bort alla egna tillagda spelare och återställa truppen?")) {
          customPlayers = [];
          try {
            localStorage.removeItem("betpals_shl_custom_players");
          } catch (e) {}
          reloadAllPlayers();
          refresh();
        }
      });

      // Submit new custom player
      root.querySelector("#btn-submit-new-player")?.addEventListener("click", () => {
        const nameInput = root.querySelector("#new-player-name");
        const teamSelect = root.querySelector("#new-player-team");
        const posSelect = root.querySelector("#new-player-pos");
        const numInput = root.querySelector("#new-player-num");

        const name = nameInput?.value?.trim();
        if (!name) {
          alert("Vänligen ange spelarens namn.");
          nameInput?.focus();
          return;
        }

        const team = teamSelect?.value || "IFB";
        const pos = posSelect?.value || "F";
        const num = parseInt(numInput?.value, 10) || 10;
        const newPlayer = {
          id: `custom_${Date.now()}`,
          name,
          team,
          pos,
          num,
          price: 8,
          form: 8.5
        };

        customPlayers.push(newPlayer);
        try {
          localStorage.setItem("betpals_shl_custom_players", JSON.stringify(customPlayers));
        } catch (e) {}
        reloadAllPlayers();
        isAddingPlayer = false;

        // Auto-select if slot is free
        if (pos === "G" && !myLineup.goalie) {
          myLineup.goalie = newPlayer;
        } else if (pos === "D" && myLineup.defenders.length < 2) {
          myLineup.defenders.push(newPlayer);
        } else if (pos === "F" && myLineup.forwards.length < 3) {
          myLineup.forwards.push(newPlayer);
        }

        refresh();
      });

      // Toggle / Add player
      root.querySelectorAll(".btn-toggle-player").forEach(btn => {
        btn.addEventListener("click", () => {
          if (isLockedIn || (isMultiplayer && (currentLeague?.status === "finished" || (currentLeague?.simulation_data && currentLeague?.simulation_data?.currentDay > 0)))) {
            showToast("Laget är låst! Lås upp truppen först för att göra ändringar.", "error");
            return;
          }
          const pId = btn.dataset.playerId;
          const player = allPlayers.find(p => p.id === pId);
          if (!player) return;

          if (isPlayerSelected(pId)) {
            // Remove
            if (myLineup.goalie?.id === pId) myLineup.goalie = null;
            myLineup.defenders = myLineup.defenders.filter(d => d.id !== pId);
            myLineup.forwards = myLineup.forwards.filter(f => f.id !== pId);
          } else {
            // Add based on pos
            if (player.pos === "G") {
              myLineup.goalie = player;
            } else if (player.pos === "D") {
              if (myLineup.defenders.length < 2) {
                myLineup.defenders.push(player);
              } else {
                myLineup.defenders[1] = player; // replace second
              }
            } else if (player.pos === "F") {
              if (myLineup.forwards.length < 3) {
                myLineup.forwards.push(player);
              } else {
                myLineup.forwards[2] = player; // replace third
              }
            }
          }
          refresh();
        });
      });

      // Lock in button
      root.querySelector("#btn-lock-squad")?.addEventListener("click", async () => {
        if (isLockedIn) {
          // If simulation already started, can't unlock
          if (isMultiplayer && (currentLeague?.status === "finished" || (currentLeague?.simulation_data && currentLeague?.simulation_data?.currentDay > 0))) {
            showToast("Omgången har redan påbörjats. Laget kan inte låsas upp.", "error");
            return;
          }
          isLockedIn = false;
          if (isMultiplayer && currentLeague) {
            try {
              const updated = await joinShlLeague(currentLeague.code, {
                lineup: myLineup,
                swishNumber: currentUser.swish_number || "",
                unlock: true,
                isLocked: false
              });
              currentLeague = updated;
              showToast("Truppen har låsts upp! Du kan nu ändra spelare. 🔓", "success");
            } catch (err) {
              showToast(err.message || "Kunde inte låsa upp laget", "error");
            }
          } else {
            showToast("Truppen har låsts upp! Du kan nu ändra spelare. 🔓", "success");
          }
          refreshAll();
          return;
        }

        if (getTotalSelectedCount() < 6) {
          showToast("Välj en komplett femma + målvakt (6 spelare) innan du låser truppen! 🏒", "error");
          return;
        }

        isLockedIn = true;
        if (isMultiplayer && currentLeague) {
          try {
            const updated = await joinShlLeague(currentLeague.code, {
              lineup: myLineup,
              swishNumber: currentUser.swish_number || "",
              isLocked: true
            });
            currentLeague = updated;
            showToast("Ditt lag har låsts in i ligan! 🏒", "success");
          } catch (err) {
            showToast(err.message || "Kunde inte låsa laget", "error");
          }
        } else {
          showToast("Ditt lag har låsts in! 🏒", "success");
        }
        activeTab = "pot";
        refreshAll();
      });
    }

    // Pot tab actions
    if (activeTab === "pot") {
      root.querySelectorAll(".stake-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          selectedMode = btn.dataset.mode;
          if (btn.dataset.stake) {
            selectedStake = parseInt(btn.dataset.stake, 10);
          }
          refresh();
        });
      });

      root.querySelector("#btn-go-to-live")?.addEventListener("click", () => {
        activeTab = "live";
        refreshAll();
      });

      // Pot tab invite button
      root.querySelector("#btn-pot-invite-friends")?.addEventListener("click", () => {
        openInviteFriendsDialog();
      });
    }

    // Multiplayer room banner actions
    root.querySelector("#btn-share-shl-league")?.addEventListener("click", () => {
      openInviteFriendsDialog();
    });

    root.querySelector("#btn-create-shl-league")?.addEventListener("click", async () => {
      if (!isLoggedIn()) {
        alert("Du behöver vara inloggad för att skapa en kompis-liga!");
        return;
      }
      const defaultName = `SHL Fantasy ${currentRound.name} (${currentUser.nickname})`;
      const name = prompt("Vad vill du döpa kompis-ligan till?", defaultName);
      if (!name) return;

      try {
        const created = await createShlLeague({
          name,
          roundId: selectedRoundId,
          stakeAmount: selectedStake,
          mode: selectedMode
        });
        currentLeague = created;
        isMultiplayer = true;
        setupLeagueWebSocket(created.code);
        showToast(`Kompis-ligan #${created.code} skapades! 🎉`, 'success');

        // Automatically join with current lineup if complete
        if (getTotalSelectedCount() === 6) {
          await joinShlLeague(created.code, {
            lineup: myLineup,
            swishNumber: currentUser.swish_number || ""
          });
          const reloaded = await getShlLeague(created.code);
          if (reloaded) currentLeague = reloaded;
        }

        refreshAll();
      } catch (err) {
        showToast(err.message || 'Kunde inte skapa ligan', 'error');
      }
    });

    root.querySelector("#btn-join-shl-league")?.addEventListener("click", async () => {
      const code = prompt("Ange ligakoden (t.ex. SHL123):");
      if (!code) return;
      try {
        const l = await getShlLeague(code.trim().toUpperCase());
        if (!l) {
          showToast("Ligan hittades inte", "error");
          return;
        }
        currentLeague = l;
        isMultiplayer = true;
        setupLeagueWebSocket(l.code);
        selectedRoundId = l.round_id;
        selectedStake = l.stake_amount;
        selectedMode = l.mode;
        currentRound = getCurrentRound();
        roundGames = getGamesForRound(currentRound);

        const myEntry = l.entries.find(e => e.user_id === currentUser.id);
        if (myEntry && myEntry.lineup) {
          myLineup = myEntry.lineup;
          isLockedIn = true;
        }

        showToast(`Gick med i ${l.name}! 🏒`, 'success');
        refreshAll();
      } catch (err) {
        showToast(err.message || "Kunde inte ansluta", "error");
      }
    });

    // Copy settlement results
    root.querySelector("#btn-copy-shl-results")?.addEventListener("click", async () => {
      const activeStake = isMultiplayer ? currentLeague.stake_amount : selectedStake;
      let text = `🏆 SHL MINI FANTASY RESULTAT (${currentRound.name})\n\n`;
      const allEntries = isMultiplayer ? currentLeague.entries : [];
      if (allEntries.length > 0) {
        const sorted = [...allEntries].sort((a, b) => (b.points || 0) - (a.points || 0));
        const winner = sorted[0];
        text += `👑 Vinnare: ${winner.user_name} (${winner.points || 0}p)\n`;
        text += `💰 Vinstpott: ${sorted.length * activeStake} kr\n`;
        if (winner.swish_number) text += `📱 Swisha vinnaren på: ${winner.swish_number}\n\n`;
        text += `Slutställning:\n`;
        sorted.forEach((s, idx) => {
          text += `${idx + 1}. ${s.user_name} - ${s.points || 0}p\n`;
        });
      } else {
        text += `Alla matcher spelade i ${currentRound.name}! Kolla tabellen i appen!`;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          showToast("Kopierade resultaten till urklipp! 📋", "success");
        } else {
          prompt("Kopiera texten:", text);
        }
      } catch (e) {
        prompt("Kopiera texten:", text);
      }
    });

    // Toggle Swish Paid Receipt
    root.querySelectorAll(".btn-toggle-shl-paid").forEach(btn => {
      btn.addEventListener("click", async () => {
        const targetUserId = btn.dataset.userId;
        const newStatus = btn.dataset.isPaid === "1";

        if (isMultiplayer && currentLeague) {
          try {
            const updated = await toggleShlPaid(currentLeague.code, {
              userId: targetUserId,
              isPaid: newStatus
            });
            currentLeague = updated;
            refresh();
          } catch (e) {
            showToast(e.message, "error");
          }
        } else {
          // Solo mode mock
          const target = competitors.find(c => c.id === targetUserId);
          if (target) {
            target.paid = newStatus;
            refresh();
          }
        }
      });
    });

    // Live tab actions
    if (activeTab === "live") {
      root.querySelector("#btn-simulate-round")?.addEventListener("click", () => {
        const totalDays = currentRound.days.length;
        if (!isMultiplayer && currentSimulatedDay >= totalDays) {
          // Reset round
          resetSimulation();
        } else {
          // Simulate next day
          simulateNextDay();
        }
      });
    }
  }

  // Dialog to invite friends via link, web share, or in-app push
  function openInviteFriendsDialog() {
    if (!currentLeague) {
      alert("Starta först en kompis-liga!");
      return;
    }

    const shareUrl = `${window.location.origin}/?shl=${currentLeague.code}`;
    const shareText = `🏒 Häng med i SHL Fantasy (${currentRound.name})! Välj din femma + målvakt och tävla om Swish-potten (${currentLeague.stake_amount} kr).`;

    const friendCheckboxes = userFriends.length > 0 ? `
      <div style="margin: 12px 0 8px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
        <div style="font-size: 0.75rem; font-weight: 700; color: var(--gold); margin-bottom: 6px;">
          👥 Skicka notis direkt i appen:
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
          ${userFriends.map(f => `
            <label class="flex align-center gap-xs" style="font-size: 0.8rem; cursor: pointer; padding: 4px 6px; background: rgba(255,255,255,0.02); border-radius: 4px;">
              <input type="checkbox" class="shl-invite-friend-checkbox" value="${f.id}" checked />
              <span>${f.avatar || "👤"}</span>
              <span style="font-weight: 600;">${escapeHtml(f.realName || f.nickname)}</span>
              <span style="color: var(--text-secondary); font-size: 0.7rem;">@${escapeHtml(f.nickname)}</span>
            </label>
          `).join("")}
        </div>
        <button type="button" class="btn btn-sm btn-primary w-100 mt-xs" id="btn-send-in-app-invites" style="font-size: 0.75rem; padding: 6px;">
          🔔 Skicka inbjudan till valda (${userFriends.length})
        </button>
      </div>
    ` : "";

    const contentHtml = `
      <div style="text-align: center; padding: 4px 0;">
        <div style="font-size: 1.8rem; margin-bottom: 4px;">🏒 👥</div>
        <div style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; color: var(--gold); margin-bottom: 4px;">
          Bjud in till "${escapeHtml(currentLeague.name)}"
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 12px;">
          Dela ligakoden eller skicka en direktlänk till polarna:
        </div>

        <div class="card mb-sm" style="background: rgba(0,0,0,0.4); border: 1px dashed var(--gold); padding: 10px;">
          <div style="font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase;">LIGAKOD:</div>
          <div style="font-family: monospace; font-size: 1.6rem; font-weight: 900; color: var(--gold); letter-spacing: 0.1em;">
            ${currentLeague.code}
          </div>
        </div>

        <div class="flex gap-xs mb-sm">
          <button type="button" class="btn btn-primary w-100" id="btn-copy-invite-link" style="font-size: 0.82rem; font-weight: 700; padding: 10px;">
            📋 Kopiera inbjudningslänk
          </button>
          ${navigator.share ? `
            <button type="button" class="btn btn-secondary" id="btn-web-share" style="padding: 10px 14px; font-size: 1.1rem;">
              📲
            </button>
          ` : ""}
        </div>

        ${friendCheckboxes}
      </div>
    `;

    const subModal = showModal("Bjud in vänner 🏒", contentHtml);

    subModal.root.querySelector("#btn-copy-invite-link")?.addEventListener("click", async () => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          showToast("Inbjudningslänk kopierad till urklipp! 📋", "success");
        } else {
          prompt("Kopiera länk:", shareUrl);
        }
      } catch (e) {
        prompt("Kopiera länk:", shareUrl);
      }
    });

    subModal.root.querySelector("#btn-web-share")?.addEventListener("click", async () => {
      try {
        await navigator.share({
          title: `SHL Fantasy - ${currentLeague.name}`,
          text: shareText,
          url: shareUrl
        });
      } catch (e) {}
    });

    subModal.root.querySelector("#btn-send-in-app-invites")?.addEventListener("click", async () => {
      const selected = Array.from(subModal.root.querySelectorAll(".shl-invite-friend-checkbox:checked")).map(cb => cb.value);
      if (selected.length === 0) {
        alert("Välj minst en vän att bjuda in.");
        return;
      }
      try {
        await inviteFriendsToShlLeague(currentLeague.code, selected);
        showToast(`Inbjudan skickad till ${selected.length} vänner! 🔔`, 'success');
        subModal.close();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function refreshAll() {
    const modalBody = root.querySelector('.modal-body');
    if (modalBody) {
      modalBody.innerHTML = renderContent();
    } else {
      root.innerHTML = `
        <div class="modal-overlay" id="modal-overlay">
          <div class="modal-content" style="position: relative;">
            <div class="modal-header">
              <h3 class="modal-title">${modalTitle}</h3>
              <button class="modal-close" id="modal-close-btn">&times;</button>
            </div>
            <div class="modal-body">
              ${renderContent()}
            </div>
          </div>
        </div>
      `;
    }
    attachTabListeners();
  }

  // ── SIMULATION ENGINE FOR LIVE ROUND & MULTI-DAY TRACKING ──
  function resetSimulation() {
    if (isMultiplayer) return;
    currentSimulatedDay = 0;
    roundSimulated = false;
    liveMatchResults = initLiveMatchResults();
    const clearPts = (p) => { if (p) delete p.pts; };
    if (myLineup.goalie) clearPts(myLineup.goalie);
    (myLineup.defenders || []).forEach(clearPts);
    (myLineup.forwards || []).forEach(clearPts);
    competitors.forEach(c => {
      if (c.lineup?.goalie) clearPts(c.lineup.goalie);
      (c.lineup?.defenders || []).forEach(clearPts);
      (c.lineup?.forwards || []).forEach(clearPts);
      c.points = 0;
    });
    refresh();
  }

  async function simulateNextDay() {
    if (isMultiplayer && currentLeague) {
      const isCreator = currentUser && (currentLeague.creator_id === currentUser.id || currentUser.is_admin);
      if (!isCreator) {
        showToast("Endast ligans skapare kan simulera matcher", "error");
        return;
      }
      try {
        const updated = await simulateShlLeague(currentLeague.code);
        currentLeague = updated;
        if (updated.simulation_data) {
          currentSimulatedDay = updated.simulation_data.currentDay || 0;
          roundSimulated = !!updated.simulation_data.roundSimulated;
          if (updated.simulation_data.matchResults) {
            liveMatchResults = updated.simulation_data.matchResults;
          }
        }
        const myEntry = (updated.entries || []).find(e => e.user_id === currentUser.id);
        if (myEntry?.lineup) {
          myLineup = myEntry.lineup;
        }
        refreshAll();
        if (updated.status === 'finished') {
          showToast("Omgången är färdigspelad och ligan är avräknad! 🏆", "success");
        }
      } catch (err) {
        showToast(err.message || "Kunde inte simulera omgången", "error");
      }
      return;
    }

    // Solo mode:
    const dayIndex = currentSimulatedDay; // 0 for day 1, 1 for day 2
    if (dayIndex >= currentRound.days.length) return;

    const day = currentRound.days[dayIndex];
    const dayGameIds = new Set(day.games.map(g => g.id));
    const dayActiveTeams = new Set();
    day.games.forEach(g => {
      dayActiveTeams.add(g.home);
      dayActiveTeams.add(g.away);
    });

    // Finish matches for this specific day with overtime if tied (no ties in SHL)
    liveMatchResults = liveMatchResults.map(m => {
      if (dayGameIds.has(m.id)) {
        let hScore = Math.floor(Math.random() * 4) + 1;
        let aScore = Math.floor(Math.random() * 4);
        let ot = false;
        if (hScore === aScore) {
          ot = true;
          if (Math.random() > 0.5) hScore += 1;
          else aScore += 1;
        }
        return {
          ...m,
          homeScore: hScore,
          awayScore: aScore,
          ot,
          status: "finished"
        };
      }
      return m;
    });

    // Issue 8 & 9: Shared evaluation map so players playing in multiple teams get evaluated once
    const dayPlayerPtsMap = new Map();
    function getPlayerDayPoints(p) {
      if (!p || !dayActiveTeams.has(p.team)) return 0;
      if (dayPlayerPtsMap.has(p.id)) return dayPlayerPtsMap.get(p.id);

      let pts = 0;
      if (p.pos === "G") {
        const game = liveMatchResults.find(m => (m.home === p.team || m.away === p.team) && dayGameIds.has(m.id));
        const isHome = game && game.home === p.team;
        const myScore = game ? (isHome ? game.homeScore : game.awayScore) : 0;
        const oppScore = game ? (isHome ? game.awayScore : game.homeScore) : 0;
        const won = myScore > oppScore;
        const winPts = won ? 4 : 0;
        const shutoutPts = won && oppScore === 0 ? 5 : 0;
        const goalsAgainstPts = -oppScore;
        pts = Math.max(-5, winPts + shutoutPts + goalsAgainstPts);
      } else if (p.pos === "D") {
        const goals = Math.random() > 0.75 ? 4 : 0;
        const assists = Math.random() > 0.6 ? 2 : 0;
        const pm = Math.random() > 0.5 ? 1 : -1;
        pts = goals + assists + pm;
      } else { // F
        const goals = (Math.random() > 0.6 ? 3 : 0) + (Math.random() > 0.85 ? 3 : 0);
        const assists = (Math.random() > 0.5 ? 2 : 0) + (Math.random() > 0.8 ? 2 : 0);
        const gwg = Math.random() > 0.85 ? 2 : 0;
        pts = goals + assists + gwg;
      }

      dayPlayerPtsMap.set(p.id, pts);
      return pts;
    }

    const applyPoints = (p) => {
      if (!p || !dayActiveTeams.has(p.team)) return;
      const pts = getPlayerDayPoints(p);
      p.pts = (p.pts || 0) + pts;
    };

    if (myLineup.goalie) applyPoints(myLineup.goalie);
    (myLineup.defenders || []).forEach(applyPoints);
    (myLineup.forwards || []).forEach(applyPoints);

    competitors.forEach(c => {
      if (c.lineup?.goalie) applyPoints(c.lineup.goalie);
      (c.lineup?.defenders || []).forEach(applyPoints);
      (c.lineup?.forwards || []).forEach(applyPoints);
      c.points = calculateLineupPoints(c.lineup);
    });

    currentSimulatedDay += 1;
    if (currentSimulatedDay >= currentRound.days.length) {
      roundSimulated = true;
    }

    refresh();
  }

  attachTabListeners();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
