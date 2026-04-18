const endpointBase = (document.body?.dataset?.leaderboardEndpoint || "/api/leaderboard").trim();
const defaultModeCandidate = (document.body?.dataset?.defaultMode || "ranked").toLowerCase();
const defaultMode = defaultModeCandidate === "unranked" ? "unranked" : "ranked";
const fetchLimit = 50;
const autoRefreshMs = 45000;

const elements = {
  status: document.getElementById("boardStatus"),
  search: document.getElementById("playerSearch"),
  rows: document.getElementById("leaderboardRows"),
  listCount: document.getElementById("listCount"),
  refreshButton: document.getElementById("refreshButton"),
  modeButtons: Array.from(document.querySelectorAll(".mode-btn")),
  summaryPlayers: document.getElementById("summaryPlayers"),
  summaryAverageRating: document.getElementById("summaryAverageRating"),
  summaryTopDamage: document.getElementById("summaryTopDamage"),
  summaryBestWinRate: document.getElementById("summaryBestWinRate"),
  detailModeBadge: document.getElementById("detailModeBadge"),
  detailUsername: document.getElementById("detailUsername"),
  detailPosition: document.getElementById("detailPosition"),
  detailRating: document.getElementById("detailRating"),
  detailRr: document.getElementById("detailRr"),
  detailMatches: document.getElementById("detailMatches"),
  detailWinRate: document.getElementById("detailWinRate"),
  detailRounds: document.getElementById("detailRounds"),
  detailRoundWinRate: document.getElementById("detailRoundWinRate"),
  detailEliminations: document.getElementById("detailEliminations"),
  detailDeaths: document.getElementById("detailDeaths"),
  detailDamageDealt: document.getElementById("detailDamageDealt"),
  detailDamageTaken: document.getElementById("detailDamageTaken"),
  detailDamageDelta: document.getElementById("detailDamageDelta"),
  detailKd: document.getElementById("detailKd"),
};

const state = {
  mode: defaultMode,
  allPlayers: [],
  filteredPlayers: [],
  selectedUsername: "",
  searchTerm: "",
};

let loadToken = 0;

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  return Math.round(toNumber(value)).toLocaleString();
}

function formatRate(part, total) {
  const safeTotal = toNumber(total);
  const safePart = toNumber(part);
  if (safeTotal <= 0) {
    return "0.0%";
  }
  return `${((safePart / safeTotal) * 100).toFixed(1)}%`;
}

function getRatingValue(player) {
  return toNumber(player?.rating || player?.rr || 0);
}

function getWinRate(player) {
  return toNumber(player?.matches_played) > 0
    ? toNumber(player?.matches_won) / toNumber(player?.matches_played)
    : 0;
}

function getKd(player) {
  const eliminations = toNumber(player?.eliminations);
  const deaths = toNumber(player?.deaths);
  if (deaths <= 0) {
    return eliminations > 0 ? eliminations.toFixed(2) : "0.00";
  }
  return (eliminations / deaths).toFixed(2);
}

function getDamageDelta(player) {
  return toNumber(player?.damage_dealt) - toNumber(player?.damage_taken);
}

function setStatus(message, type = "info") {
  if (!elements.status) {
    return;
  }

  elements.status.textContent = message;
  elements.status.classList.remove("status-ok", "status-error");

  if (type === "ok") {
    elements.status.classList.add("status-ok");
  }
  if (type === "error") {
    elements.status.classList.add("status-error");
  }
}

function setModeButtonsState(disabled) {
  elements.modeButtons.forEach((button) => {
    button.disabled = disabled;
  });
}

function setActiveModeButton(mode) {
  elements.modeButtons.forEach((button) => {
    const isSelected = button.dataset.mode === mode;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
}

function applySearch() {
  const query = state.searchTerm.trim().toLowerCase();
  if (!query) {
    state.filteredPlayers = [...state.allPlayers];
  } else {
    state.filteredPlayers = state.allPlayers.filter((player) =>
      String(player?.username || "").toLowerCase().includes(query)
    );
  }

  const selectionStillVisible = state.filteredPlayers.some(
    (player) => String(player?.username || "") === state.selectedUsername
  );

  if (!selectionStillVisible) {
    state.selectedUsername = state.filteredPlayers[0]
      ? String(state.filteredPlayers[0].username)
      : "";
  }
}

function updateSummaryCards() {
  const totalPlayers = state.filteredPlayers.length;

  const averageRating =
    totalPlayers > 0
      ? state.filteredPlayers.reduce((sum, player) => sum + getRatingValue(player), 0) /
        totalPlayers
      : 0;

  const topDamage = state.filteredPlayers.reduce(
    (maxValue, player) => Math.max(maxValue, toNumber(player?.damage_dealt)),
    0
  );

  const bestWinRate = state.filteredPlayers.reduce(
    (maxRate, player) => Math.max(maxRate, getWinRate(player)),
    0
  );

  if (elements.summaryPlayers) {
    elements.summaryPlayers.textContent = totalPlayers.toLocaleString();
  }
  if (elements.summaryAverageRating) {
    elements.summaryAverageRating.textContent = averageRating.toFixed(1);
  }
  if (elements.summaryTopDamage) {
    elements.summaryTopDamage.textContent = formatNumber(topDamage);
  }
  if (elements.summaryBestWinRate) {
    elements.summaryBestWinRate.textContent = `${(bestWinRate * 100).toFixed(1)}%`;
  }

  if (elements.listCount) {
    elements.listCount.textContent = `${state.filteredPlayers.length} shown`;
  }
}

function createPlayerRow(player) {
  const username = String(player?.username || "Unknown");
  const position = Math.max(1, toNumber(player?.position));
  const rating = getRatingValue(player);
  const wins = toNumber(player?.matches_won);
  const matches = toNumber(player?.matches_played);
  const eliminations = toNumber(player?.eliminations);

  const row = document.createElement("button");
  row.type = "button";
  row.className = "player-row";
  if (username === state.selectedUsername) {
    row.classList.add("is-selected");
  }

  row.addEventListener("click", () => {
    state.selectedUsername = username;
    renderRows();
    renderDetails();
  });

  const rankBadge = document.createElement("div");
  rankBadge.className = "rank-badge";
  if (position <= 3) {
    rankBadge.classList.add("rank-top");
  }

  const rankText = document.createElement("strong");
  rankText.textContent = `#${position}`;

  const rankMode = document.createElement("span");
  rankMode.textContent = state.mode;

  rankBadge.append(rankText, rankMode);

  const main = document.createElement("div");
  main.className = "player-main";

  const name = document.createElement("h3");
  name.textContent = username;

  const sub = document.createElement("p");
  sub.textContent = `${wins}/${matches} match wins - ${formatNumber(eliminations)} eliminations`;

  main.append(name, sub);

  const score = document.createElement("div");
  score.className = "player-score";

  const scoreValue = document.createElement("strong");
  scoreValue.textContent = formatNumber(rating);

  const scoreLabel = document.createElement("span");
  scoreLabel.textContent = state.mode === "ranked" ? "Rating" : "Score";

  score.append(scoreValue, scoreLabel);
  row.append(rankBadge, main, score);
  return row;
}

function renderRows() {
  if (!elements.rows) {
    return;
  }

  elements.rows.innerHTML = "";

  if (state.filteredPlayers.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.searchTerm
      ? "No players match this search."
      : "No leaderboard data available for this mode yet.";
    elements.rows.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredPlayers.forEach((player) => {
    fragment.appendChild(createPlayerRow(player));
  });

  elements.rows.appendChild(fragment);
}

function getSelectedPlayer() {
  return state.filteredPlayers.find(
    (player) => String(player?.username || "") === state.selectedUsername
  );
}

function renderDetails() {
  const selected = getSelectedPlayer();

  if (!selected) {
    elements.detailModeBadge.textContent = state.mode;
    elements.detailUsername.textContent = "Select a player";
    elements.detailPosition.textContent = "Waiting for player selection";
    elements.detailRating.textContent = "-";
    elements.detailRr.textContent = "-";
    elements.detailMatches.textContent = "-";
    elements.detailWinRate.textContent = "-";
    elements.detailRounds.textContent = "-";
    elements.detailRoundWinRate.textContent = "-";
    elements.detailEliminations.textContent = "-";
    elements.detailDeaths.textContent = "-";
    elements.detailDamageDealt.textContent = "0";
    elements.detailDamageTaken.textContent = "0";
    elements.detailDamageDelta.textContent = "0";
    elements.detailKd.textContent = "0.00";
    return;
  }

  const position = Math.max(1, toNumber(selected?.position));
  const matchesWon = toNumber(selected?.matches_won);
  const matchesPlayed = toNumber(selected?.matches_played);
  const roundsWon = toNumber(selected?.rounds_won);
  const roundsPlayed = toNumber(selected?.rounds_played);
  const damageDelta = getDamageDelta(selected);

  elements.detailModeBadge.textContent = state.mode;
  elements.detailUsername.textContent = String(selected?.username || "Unknown");
  elements.detailPosition.textContent = `Position #${position} in ${state.mode} mode`;
  elements.detailRating.textContent = formatNumber(selected?.rating);
  elements.detailRr.textContent = formatNumber(selected?.rr);
  elements.detailMatches.textContent = `${formatNumber(matchesWon)} / ${formatNumber(matchesPlayed)} won`;
  elements.detailWinRate.textContent = formatRate(matchesWon, matchesPlayed);
  elements.detailRounds.textContent = `${formatNumber(roundsWon)} / ${formatNumber(roundsPlayed)} won`;
  elements.detailRoundWinRate.textContent = formatRate(roundsWon, roundsPlayed);
  elements.detailEliminations.textContent = formatNumber(selected?.eliminations);
  elements.detailDeaths.textContent = formatNumber(selected?.deaths);
  elements.detailDamageDealt.textContent = formatNumber(selected?.damage_dealt);
  elements.detailDamageTaken.textContent = formatNumber(selected?.damage_taken);
  elements.detailDamageDelta.textContent = `${damageDelta >= 0 ? "+" : ""}${formatNumber(damageDelta)}`;
  elements.detailKd.textContent = getKd(selected);
}

function buildEndpointUrl(mode) {
  const url = new URL(endpointBase, window.location.origin);
  url.searchParams.set("mode", mode);
  url.searchParams.set("limit", String(fetchLimit));
  return url.toString();
}

async function loadLeaderboard(mode, { silent = false } = {}) {
  const token = ++loadToken;
  state.mode = mode;
  setActiveModeButton(mode);

  if (!silent) {
    setStatus(`Loading ${mode} leaderboard...`);
  }

  setModeButtonsState(true);

  try {
    const response = await fetch(buildEndpointUrl(mode), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (token !== loadToken) {
      return;
    }

    const incomingPlayers = Array.isArray(payload?.leaderboard)
      ? payload.leaderboard
      : [];

    state.allPlayers = incomingPlayers.sort(
      (left, right) => toNumber(left?.position) - toNumber(right?.position)
    );
    applySearch();
    updateSummaryCards();
    renderRows();
    renderDetails();

    const updatedAt = payload?.refreshedAt
      ? new Date(payload.refreshedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const shown = state.filteredPlayers.length;
    const total = state.allPlayers.length;
    const updateSuffix = updatedAt ? ` - updated ${updatedAt}` : "";
    setStatus(`Showing ${shown} of ${total} players${updateSuffix}`, "ok");
  } catch (error) {
    if (token !== loadToken) {
      return;
    }

    state.allPlayers = [];
    state.filteredPlayers = [];
    state.selectedUsername = "";
    updateSummaryCards();
    renderRows();
    renderDetails();
    setStatus(`Unable to load leaderboard (${error.message})`, "error");
  } finally {
    if (token === loadToken) {
      setModeButtonsState(false);
    }
  }
}

function attachEvents() {
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetMode = button.dataset.mode === "unranked" ? "unranked" : "ranked";
      if (targetMode === state.mode) {
        return;
      }
      loadLeaderboard(targetMode);
    });
  });

  if (elements.search) {
    elements.search.addEventListener("input", (event) => {
      state.searchTerm = String(event.target.value || "");
      applySearch();
      updateSummaryCards();
      renderRows();
      renderDetails();
    });
  }

  if (elements.refreshButton) {
    elements.refreshButton.addEventListener("click", () => {
      loadLeaderboard(state.mode);
    });
  }
}

attachEvents();
loadLeaderboard(state.mode);
setInterval(() => {
  loadLeaderboard(state.mode, { silent: true });
}, autoRefreshMs);
