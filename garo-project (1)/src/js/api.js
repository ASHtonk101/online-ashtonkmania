import { API_BASE } from "./config.js";

async function request(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  listLobbies: () => request("/api/lobbies"),
  createLobby: (payload) => request("/api/lobbies", { method: "POST", body: JSON.stringify(payload) }),
  joinByCode: (code, password) =>
    request(`/api/lobbies/by-code/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ password: password || "" }),
    }),
  joinLobby: (id, password) =>
    request(`/api/lobbies/${id}/join`, {
      method: "POST",
      body: JSON.stringify({ password: password || "" }),
    }),
};

export function wsURL(lobbyId, userId, username) {
  const base = API_BASE.replace(/^http/, "ws");
  const qs = new URLSearchParams({ userId, username }).toString();
  return `${base}/api/lobbies/${lobbyId}/ws?${qs}`;
}
