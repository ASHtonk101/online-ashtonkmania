const STORAGE_KEY = "ashtonk_lobby_state_v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function save(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function genId() {
  return "u_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const stored = load();

export const state = {
  userId: stored.userId || genId(),
  username: stored.username || `Player${Math.floor(Math.random() * 9999)}`,
  currentLobby: null,
  ws: null,
  players: [],
  hostId: null,
};

if (!stored.userId) {
  save({ userId: state.userId, username: state.username });
}

export function setUsername(name) {
  state.username = name.trim() || state.username;
  save({ userId: state.userId, username: state.username });
}
