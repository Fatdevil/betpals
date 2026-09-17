// ── 🏒 SHL Mini Fantasy Component ─────────────────────────
import { showModal, closeModal } from "./modal.js";
import { t, getLang } from "../i18n.js";
import { getStoredUser } from "../auth.js";
import { getFriends } from "../api.js";
import { SHL_TEAMS, SHL_PLAYERS, SHL_ROUND_GAMES, FANTASY_SCORING } from "../data/shlPlayers.js";

export async function openShlFantasyModal() {
  const isEn = getLang() === "en";
  const currentUser = getStoredUser() || { nickname: "Du", avatar_emoji: "🏒" };

  let activeTab = "draft"; // draft, pot, live, rules
  let selectedStake = 50; // kr
  let selectedMode = "swish"; // "free" or "swish"
  let isLockedIn = false;
  let isSimulating = false;
  let roundSimulated = false;

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
        goalie: SHL_PLAYERS.find(p => p.id === "g_lagace"),
        defenders: [SHL_PLAYERS.find(p => p.id === "d_tommernes"), SHL_PLAYERS.find(p => p.id === "d_nygren")],
        forwards: [SHL_PLAYERS.find(p => p.id === "f_tomasek"), SHL_PLAYERS.find(p => p.id === "f_nygard"), SHL_PLAYERS.find(p => p.id === "f_dahlen")]
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
        goalie: SHL_PLAYERS.find(p => p.id === "g_soderstrom"),
        defenders: [SHL_PLAYERS.find(p => p.id === "d_pudas"), SHL_PLAYERS.find(p => p.id === "d_gustafsson")],
        forwards: [SHL_PLAYERS.find(p => p.id === "f_lindberg"), SHL_PLAYERS.find(p => p.id === "f_omark"), SHL_PLAYERS.find(p => p.id === "f_friberg")]
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
        goalie: SHL_PLAYERS.find(p => p.id === "g_persson"),
        defenders: [SHL_PLAYERS.find(p => p.id === "d_djoos"), SHL_PLAYERS.find(p => p.id === "d_caito")],
        forwards: [SHL_PLAYERS.find(p => p.id === "f_silfverberg"), SHL_PLAYERS.find(p => p.id === "f_lindblom"), SHL_PLAYERS.find(p => p.id === "f_cehlarik")]
      },
      points: 0,
      breakdown: []
    }
  ];

  // Live match events generator state
  let liveMatchResults = SHL_ROUND_GAMES.map(g => ({
    ...g,
    homeScore: 0,
    awayScore: 0,
    period: "19:00",
    status: "scheduled",
    events: []
  }));

  const modalTitle = `<img src="/hockey-gold.png" alt="" style="width: 28px; height: 28px; object-fit: contain; vertical-align: -5px; margin-right: 8px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));" /> ${isEn ? "SHL Mini Fantasy 🏒" : "SHL Mini Fantasy 🏒"}`;

  function getTotalSelectedCount() {
    return (myLineup.goalie ? 1 : 0) + myLineup.defenders.length + myLineup.forwards.length;
  }

  function renderContent() {
    return `
      <div class="shl-fantasy-container" style="max-width: 480px; margin: 0 auto; text-align: left; user-select: none;">
        
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
    let filteredPlayers = SHL_PLAYERS.filter(p => {
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
          <button type="button" class="btn btn-success btn-sm mt-sm w-100" id="btn-lock-squad" style="font-weight: 800; padding: 10px; font-size: 0.88rem; background: linear-gradient(135deg, #10b981, #059669); border: none; box-shadow: 0 4px 12px rgba(16,185,129,0.4);">
            🔒 ${isEn ? "LOCK IN SQUAD & JOIN POT" : "LÅS LAGET & GÅ TILL POTTEN"}
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
            ${SHL_TEAMS.map(t => `<option value="${t.short}" ${activeTeamFilter === t.short ? "selected" : ""}>${t.name}</option>`).join("")}
          </select>
          <!-- Search input -->
          <input type="text" id="shl-search-input" placeholder="${isEn ? "Search player..." : "Sök spelare..."}" value="${escapeHtml(searchQuery)}" style="background: rgba(0,0,0,0.5); color: #fff; border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 5px 8px; font-size: 0.8rem; flex: 1.2;" />
        </div>
      </div>

      <!-- Players List -->
      <div class="shl-players-list" style="max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px;">
        ${filteredPlayers.map(p => {
          const isSelected = isPlayerSelected(p.id);
          const posBadgeColor = p.pos === "G" ? "#10b981" : p.pos === "D" ? "#3b82f6" : "#f59e0b";
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
                  <div class="flex gap-xs" style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 1px;">
                    <span class="text-gold font-bold">${p.team}</span> ·
                    <span>Form: ⭐ ${p.form}</span>
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
    const totalPot = selectedMode === "swish" ? (competitors.length + 1) * selectedStake : 0;

    return `
      <div style="padding: 4px 0;">
        <div class="card mb-md" style="background: linear-gradient(135deg, rgba(251,191,36,0.15), rgba(16,185,129,0.1)); border: 1px solid var(--gold); padding: 14px; text-align: center;">
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
            💰 ${isEn ? "TOTAL PRIZE POT" : "KVÄLLENS TOTALA POTT"}
          </div>
          <div style="font-family: var(--font-heading); font-size: 1.8rem; font-weight: 900; color: var(--gold); margin: 4px 0;">
            ${selectedMode === "swish" ? `${totalPot} KR` : "ÄRAN & SKRYT 🪙"}
          </div>
          <div style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">
            ${competitors.length + 1} ${isEn ? "players entered" : "deltagare i potten"} (${selectedStake} kr / pers)
          </div>
        </div>

        <!-- Stake Selector -->
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

        <!-- Participants List -->
        <div class="card mb-md" style="padding: 10px 12px; background: rgba(0,0,0,0.3);">
          <div class="flex-between mb-xs align-center">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--gold);">
              👥 ${isEn ? "Friends in Pot:" : "Kompisar i potten:"}
            </span>
            <span class="badge badge-success" style="font-size: 0.65rem;">KLARA FÖR NEDSLÄPP 🏒</span>
          </div>

          <!-- Me -->
          <div class="flex-between align-center py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 0.82rem;">
            <span>${currentUser.avatar_emoji || "👤"} ${currentUser.nickname || "Du"} (Du)</span>
            <span style="color: #10b981; font-weight: 700;">✓ Inlämnad trupp</span>
          </div>
          <!-- Friends -->
          ${competitors.map(c => `
            <div class="flex-between align-center py-xs" style="border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.82rem;">
              <span>${c.avatar} ${escapeHtml(c.name)}</span>
              <span style="color: rgba(255,255,255,0.7); font-size: 0.75rem;">6/6 spelare</span>
            </div>
          `).join("")}
        </div>

        <button type="button" class="btn btn-primary w-100" id="btn-go-to-live" style="font-weight: 800; padding: 12px; font-size: 0.95rem;">
          ⚡ ${isEn ? "GO TO LIVE ROUND" : "FÖLJ LIVE-OMGÅNGEN"}
        </button>
      </div>
    `;
  }

  // ── VIEW 3: LIVE ROUND & LEADERBOARD ─────────────────────
  function renderLiveTab() {
    // Sort competitors and me by points
    const myTotalPoints = calculateLineupPoints(myLineup);
    const allSquads = [
      {
        id: "me",
        name: `${currentUser.nickname || "Du"} (Ditt lag)`,
        avatar: currentUser.avatar_emoji || "👑",
        points: myTotalPoints,
        lineup: myLineup
      },
      ...competitors
    ];

    allSquads.sort((a, b) => b.points - a.points);
    const leader = allSquads[0];

    return `
      <div style="padding: 4px 0;">
        
        <!-- Action bar / simulation button -->
        <div class="flex-between align-center mb-sm" style="background: rgba(0,0,0,0.35); padding: 8px 12px; border-radius: var(--radius-md); border: 1px solid var(--border-glass);">
          <div>
            <div style="font-size: 0.8rem; font-weight: 800; color: #10b981; display: flex; align-items: center; gap: 4px;">
              <span class="live-dot" style="display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
              ${roundSimulated ? "OMGÅNG AVSLUTAD 🏆" : "OMGÅNG PÅGÅR (P3)"}
            </div>
            <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 1px;">
              ${roundSimulated ? "Alla 7 matcher färdigspelade" : "Alla 7 matcher i full gång!"}
            </div>
          </div>

          <button type="button" class="btn btn-sm btn-secondary" id="btn-simulate-round" style="font-size: 0.75rem; padding: 6px 10px; font-weight: 700; border-color: var(--gold); color: var(--gold);">
            ${roundSimulated ? "🔄 Kör igen" : "⚡ Simulera Mål!"}
          </button>
        </div>

        <!-- Leaderboard -->
        <div class="mb-md">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--gold); margin-bottom: 6px; letter-spacing: 0.04em;">
            👑 ${isEn ? "FRIENDS LIVE STANDINGS:" : "KOMPIS-LIGAN LIVE:"}
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${allSquads.map((sq, rank) => {
              const isFirst = rank === 0 && sq.points > 0;
              const isMe = sq.id === "me";
              return `
                <div class="card" style="padding: 10px 12px; background: ${isFirst ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(16,185,129,0.08))" : "rgba(255,255,255,0.02)"}; border: 1px solid ${isFirst ? "var(--gold)" : isMe ? "rgba(16,185,129,0.4)" : "var(--border-glass)"};">
                  <div class="flex-between align-center">
                    <div class="flex align-center gap-xs">
                      <span style="font-weight: 900; font-size: 1rem; width: 22px; color: ${rank === 0 ? "var(--gold)" : "var(--text-secondary)"};">
                        ${rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`}
                      </span>
                      <span style="font-size: 1.1rem;">${sq.avatar}</span>
                      <span style="font-weight: 700; font-size: 0.88rem; color: ${isMe ? "#10b981" : "#fff"};">
                        ${escapeHtml(sq.name)}
                      </span>
                    </div>
                    <div style="text-align: right;">
                      <span style="font-family: var(--font-heading); font-size: 1.15rem; font-weight: 900; color: var(--gold);">
                        ${sq.points}p
                      </span>
                    </div>
                  </div>

                  <!-- Mini squad points detail -->
                  <div class="mt-xs" style="font-size: 0.68rem; color: rgba(255,255,255,0.6); display: flex; gap: 6px; flex-wrap: wrap;">
                    ${sq.lineup.goalie ? `<span>🧤 ${sq.lineup.goalie.name.split(" ")[1]} (${sq.lineup.goalie.pts || 0}p)</span> · ` : ""}
                    ${sq.lineup.defenders.map(d => `<span>🛡️ ${d.name.split(" ")[1]} (${d.pts || 0}p)</span>`).join(" · ")} ·
                    ${sq.lineup.forwards.map(f => `<span>🏒 ${f.name.split(" ")[1]} (${f.pts || 0}p)</span>`).join(" · ")}
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- Payout banner if finished -->
        ${roundSimulated && selectedMode === "swish" ? `
          <div class="card mb-md" style="background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(251,191,36,0.2)); border: 2px solid #10b981; padding: 14px; text-align: center;">
            <div style="font-size: 1.6rem; margin-bottom: 4px;">🏆</div>
            <div style="font-family: var(--font-heading); font-size: 1.1rem; font-weight: 800; color: #10b981; margin-bottom: 2px;">
              ${leader.name} VANN POTTEN!
            </div>
            <div style="font-size: 0.85rem; color: #fff; margin-bottom: 12px;">
              Tar hem hela kvällens pott på <strong class="text-gold">${(competitors.length + 1) * selectedStake} kr</strong>!
            </div>
            <a href="https://app.swish.nu" target="_blank" class="btn btn-success btn-sm w-100" style="font-weight: 700; padding: 8px; text-decoration: none; display: inline-block;">
              📱 Öppna Swish & Betala Vinnaren
            </a>
          </div>
        ` : ""}

        <!-- Tonight SHL Matches list -->
        <div class="mt-md">
          <div style="font-size: 0.75rem; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">
            🏒 ${isEn ? "TONIGHT SHL GAMES:" : "KVÄLLENS 7 MATCHER:"}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px;">
            ${liveMatchResults.map(m => `
              <div class="flex-between align-center" style="padding: 6px 10px; background: rgba(0,0,0,0.3); border-radius: 6px; font-size: 0.78rem;">
                <span>${m.name}</span>
                <span style="font-family: monospace; font-weight: 800; color: var(--gold);">
                  ${m.status === "scheduled" ? m.time : `${m.homeScore} – ${m.awayScore} (Slut)`}
                </span>
              </div>
            `).join("")}
          </div>
        </div>

      </div>
    `;
  }

  function calculateLineupPoints(lineup) {
    let pts = 0;
    if (lineup.goalie?.pts) pts += lineup.goalie.pts;
    lineup.defenders.forEach(d => { if (d.pts) pts += d.pts; });
    lineup.forwards.forEach(f => { if (f.pts) pts += f.pts; });
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
  const { close, root, setBusy } = showModal(modalTitle, renderContent());

  // Prevent accidental close during active fantasy draft/round
  setBusy(() => getTotalSelectedCount() > 0 || roundSimulated);

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

      // Toggle / Add player
      root.querySelectorAll(".btn-toggle-player").forEach(btn => {
        btn.addEventListener("click", () => {
          const pId = btn.dataset.playerId;
          const player = SHL_PLAYERS.find(p => p.id === pId);
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
      root.querySelector("#btn-lock-squad")?.addEventListener("click", () => {
        isLockedIn = true;
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
    }

    // Live tab actions
    if (activeTab === "live") {
      root.querySelector("#btn-simulate-round")?.addEventListener("click", () => {
        simulateShlRound();
      });
    }
  }

  function refreshAll() {
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
    attachTabListeners();
  }

  // ── SIMULATION ENGINE FOR LIVE ROUND ───────────────────────
  function simulateShlRound() {
    roundSimulated = true;

    // Simulate match scores
    liveMatchResults = liveMatchResults.map(m => {
      const hScore = Math.floor(Math.random() * 4) + 1;
      const aScore = Math.floor(Math.random() * 4);
      return {
        ...m,
        homeScore: hScore,
        awayScore: aScore,
        status: "finished"
      };
    });

    // Award random points to selected players
    const awardPlayerPts = (p) => {
      if (!p) return;
      if (p.pos === "G") {
        const win = Math.random() > 0.4 ? 4 : 0;
        const shutout = win > 0 && Math.random() > 0.7 ? 5 : 0;
        const goalsAgainst = -Math.floor(Math.random() * 3);
        p.pts = Math.max(1, win + shutout + goalsAgainst);
      } else if (p.pos === "D") {
        const goals = Math.random() > 0.6 ? 4 : 0;
        const assists = Math.random() > 0.5 ? 2 : 0;
        const pm = Math.random() > 0.5 ? 1 : -1;
        p.pts = goals + assists + pm;
      } else { // F
        const goals = (Math.random() > 0.4 ? 3 : 0) + (Math.random() > 0.8 ? 3 : 0);
        const assists = (Math.random() > 0.4 ? 2 : 0) + (Math.random() > 0.7 ? 2 : 0);
        p.pts = goals + assists;
      }
    };

    if (myLineup.goalie) awardPlayerPts(myLineup.goalie);
    myLineup.defenders.forEach(awardPlayerPts);
    myLineup.forwards.forEach(awardPlayerPts);

    competitors.forEach(c => {
      if (c.lineup.goalie) awardPlayerPts(c.lineup.goalie);
      c.lineup.defenders.forEach(awardPlayerPts);
      c.lineup.forwards.forEach(awardPlayerPts);
      c.points = calculateLineupPoints(c.lineup);
    });

    refresh();
  }

  attachTabListeners();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
