import { api } from "./api.js";
import { $, toast, escapeHtml } from "./ui.js";
import { joinLobby } from "./lobby.js";

let lobbiesCache = [];
let refreshTimer = null;

export async function refreshLobbies() {
  try {
    const { lobbies } = await api.listLobbies();
    lobbiesCache = lobbies || [];
    renderLobbies();
  } catch (err) {
    toast("Failed to load lobbies: " + err.message, "error");
  }
}

function renderLobbies() {
  const grid = $("lobbyGrid");
  const empty = $("emptyState");
  const search = $("searchInput").value.trim().toLowerCase();

  const filtered = lobbiesCache.filter(l =>
    !search || l.name.toLowerCase().includes(search)
  );

  $("lobbyCount").textContent = `${filtered.length} active`;

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = filtered.map(l => `
    <div class="lobby-card ${l.playerCount >= l.maxPlayers ? "full" : ""}" data-id="${l.id}" data-haspwd="${l.hasPassword ? "1" : "0"}" data-name="${escapeHtml(l.name)}">
      ${l.hasPassword ? '<span class="lock-icon">🔒</span>' : ""}
      <div class="name">${escapeHtml(l.name)}</div>
      <div class="meta">
        <span class="badge public">🌐 Public</span>
        <span class="badge">${l.playerCount}/${l.maxPlayers}</span>
        ${l.hasPassword ? '<span class="badge private">Password</span>' : ""}
      </div>
      <div class="host">Host: ${escapeHtml(l.hostName)}</div>
    </div>
  `).join("");

  grid.querySelectorAll(".lobby-card").forEach(card => {
    card.addEventListener("click", () => {
      if (card.classList.contains("full")) {
        toast("Lobby is full", "error");
        return;
      }
      const id = card.dataset.id;
      const hasPwd = card.dataset.haspwd === "1";
      const name = card.dataset.name;
      if (hasPwd) {
        promptPassword(id, name);
      } else {
        joinLobby(id, "");
      }
    });
  });
}

function promptPassword(id, name) {
  $("pwdLobbyName").textContent = name;
  $("pwdInput").value = "";
  $("passwordModal").classList.remove("hidden");
  $("pwdInput").focus();

  const confirm = $("confirmPwdBtn");
  const handler = () => {
    const pwd = $("pwdInput").value;
    $("passwordModal").classList.add("hidden");
    confirm.removeEventListener("click", handler);
    joinLobby(id, pwd);
  };
  confirm.addEventListener("click", handler);
}

export function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(refreshLobbies, 5000);
}

export function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

$("searchInput").addEventListener("input", renderLobbies);
