import { api, wsURL } from "./api.js";
import { state } from "./state.js";
import { $, toast, showView, escapeHtml, initials } from "./ui.js";
import { startAutoRefresh, stopAutoRefresh, refreshLobbies } from "./browser.js";

let ws = null;

export async function createLobby(payload) {
  try {
    const data = await api.createLobby(payload);
    await enterLobby(data.lobby);
  } catch (err) {
    toast("Failed to create lobby: " + err.message, "error");
  }
}

export async function joinLobby(id, password) {
  try {
    const data = await api.joinLobby(id, password);
    await enterLobby(data.lobby);
  } catch (err) {
    toast("Join failed: " + err.message, "error");
  }
}

export async function joinByCode(code, password) {
  try {
    const data = await api.joinByCode(code, password);
    await enterLobby(data.lobby);
  } catch (err) {
    toast("Join failed: " + err.message, "error");
  }
}

async function enterLobby(lobby) {
  state.currentLobby = lobby;
  stopAutoRefresh();
  showView("lobby");
  renderLobbyHeader(lobby);
  $("playersList").innerHTML = "";
  $("chatLog").innerHTML = "";
  openWebSocket(lobby.id);
}

function renderLobbyHeader(lobby) {
  $("lobbyName").textContent = lobby.name;
  const vis = $("lobbyVisibility");
  vis.textContent = lobby.visibility === "public" ? "🌐 Public" : "🔒 Private";
  vis.className = "badge " + lobby.visibility;

  const code = $("lobbyCode");
  if (lobby.visibility === "private") {
    code.textContent = lobby.code;
    code.classList.remove("hidden");
    $("copyCodeBtn").classList.remove("hidden");
  } else {
    code.classList.add("hidden");
    $("copyCodeBtn").classList.add("hidden");
  }

  $("lobbyPlayerCount").textContent = `${lobby.playerCount || 1}/${lobby.maxPlayers}`;
}

function openWebSocket(lobbyId) {
  if (ws) { try { ws.close(); } catch {} }
  const url = wsURL(lobbyId, state.userId, state.username);
  ws = new WebSocket(url);
  state.ws = ws;

  ws.addEventListener("open", () => {
    addSystemMessage("Connected to lobby");
  });

  ws.addEventListener("message", (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  });

  ws.addEventListener("close", () => {
    addSystemMessage("Disconnected");
  });

  ws.addEventListener("error", () => {
    toast("Connection error", "error");
  });
}

function handleMessage(msg) {
  switch (msg.type) {
    case "state":
      state.players = msg.players || [];
      state.hostId = msg.hostId;
      renderPlayers();
      updateHostUI();
      $("lobbyPlayerCount").textContent = `${state.players.length}/${state.currentLobby.maxPlayers}`;
      break;
    case "player_joined":
      addSystemMessage(`${msg.username} joined`);
      break;
    case "player_left":
      addSystemMessage(`${msg.username} left`);
      break;
    case "chat":
      addChatMessage(msg.username, msg.text);
      break;
    case "host_changed":
      addSystemMessage(`${msg.username} is now the host`);
      break;
    case "game_starting":
      addSystemMessage("🎮 Game starting!");
      toast("Game starting!", "success");
      break;
    case "error":
      toast(msg.message || "Error", "error");
      break;
  }
}

function renderPlayers() {
  const list = $("playersList");
  list.innerHTML = state.players.map(p => `
    <div class="player-row ${p.id === state.hostId ? "host" : ""}">
      <div class="avatar">${escapeHtml(initials(p.username))}</div>
      <div class="name">${escapeHtml(p.username)}</div>
      ${p.id === state.hostId ? '<span class="host-badge">HOST</span>' : ""}
      ${p.id === state.userId ? '<span class="you-badge">YOU</span>' : ""}
    </div>
  `).join("");
}

function updateHostUI() {
  const isHost = state.hostId === state.userId;
  $("startGameBtn").classList.toggle("hidden", !isHost);
}

function addChatMessage(username, text) {
  const log = $("chatLog");
  const div = document.createElement("div");
  div.className = "chat-msg";
  div.innerHTML = `<span class="chat-user">${escapeHtml(username)}:</span>${escapeHtml(text)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function addSystemMessage(text) {
  const log = $("chatLog");
  const div = document.createElement("div");
  div.className = "chat-msg system";
  div.innerHTML = `<span class="chat-user">●</span>${escapeHtml(text)}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

export function sendChat(text) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "chat", text }));
}

export function startGame() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "start_game" }));
}

export function leaveLobby() {
  if (ws) {
    try { ws.send(JSON.stringify({ type: "leave" })); } catch {}
    try { ws.close(); } catch {}
    ws = null;
  }
  state.currentLobby = null;
  state.players = [];
  state.hostId = null;
  showView("browser");
  refreshLobbies();
  startAutoRefresh();
}

export function copyLobbyCode() {
  if (!state.currentLobby || !state.currentLobby.code) return;
  navigator.clipboard.writeText(state.currentLobby.code).then(() => {
    toast("Code copied!", "success");
  }).catch(() => toast("Copy failed", "error"));
}
