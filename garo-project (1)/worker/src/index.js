/**
 * Ashtonk!Mania Lobby Worker
 * Cloudflare Worker + Durable Objects backend
 *
 * Routes:
 *   GET  /api/lobbies                              -> list public lobbies
 *   POST /api/lobbies                              -> create lobby
 *   POST /api/lobbies/:id/join                     -> join by id
 *   POST /api/lobbies/by-code/:code/join           -> join by code
 *   GET  /api/lobbies/:id/ws                       -> websocket upgrade
 *
 * Static files (index.html, src/**) served from the same Worker.
 */

import { LobbyRegistry } from "./registry.js";
import { LobbyRoom } from "./room.js";

export { LobbyRegistry, LobbyRoom };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...extra },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

async function callRegistry(env, method, body) {
  const id = env.LOBBY_REGISTRY.idFromName("global");
  const stub = env.LOBBY_REGISTRY.get(id);
  const res = await stub.fetch(`https://registry/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function getLobbyRoom(env, lobbyId, request) {
  const id = env.LOBBY_ROOM.idFromString(lobbyId);
  const stub = env.LOBBY_ROOM.get(id);
  return stub.fetch(request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ---- API ----
    if (path === "/api/lobbies" && request.method === "GET") {
      const out = await callRegistry(env, "list", {});
      return json(out);
    }

    if (path === "/api/lobbies" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const { name, maxPlayers, visibility, password, hostId, hostName } = body;
      if (!name || !hostId || !hostName) return err("Missing fields");

      const lobbyDoId = env.LOBBY_ROOM.newUniqueId();
      const out = await callRegistry(env, "create", {
        lobbyDoId: lobbyDoId.toString(),
        name: String(name).slice(0, 40),
        maxPlayers: Math.min(Math.max(parseInt(maxPlayers, 10) || 8, 2), 32),
        visibility: visibility === "private" ? "private" : "public",
        password: password ? String(password).slice(0, 32) : "",
        hostId,
        hostName: String(hostName).slice(0, 20),
      });

      if (out.error) return err(out.error);

      // Init the room DO with metadata
      const stub = env.LOBBY_ROOM.get(lobbyDoId);
      await stub.fetch("https://room/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lobbyDoId.toString(),
          name: out.lobby.name,
          maxPlayers: out.lobby.maxPlayers,
          visibility: out.lobby.visibility,
          password: out.lobby.password || "",
          code: out.lobby.code,
          hostId,
          hostName,
        }),
      });

      // Strip password from response
      const safe = { ...out.lobby };
      delete safe.password;
      return json({ lobby: safe });
    }

    // Join by code
    const codeJoin = path.match(/^\/api\/lobbies\/by-code\/([^/]+)\/join$/);
    if (codeJoin && request.method === "POST") {
      const code = decodeURIComponent(codeJoin[1]).toUpperCase();
      const body = await request.json().catch(() => ({}));
      const found = await callRegistry(env, "findByCode", { code });
      if (found.error) return err(found.error, 404);
      const lobby = found.lobby;
      if (lobby.password && lobby.password !== (body.password || "")) {
        return err("Wrong password", 403);
      }
      if (lobby.playerCount >= lobby.maxPlayers) return err("Lobby full", 409);
      const safe = { ...lobby };
      delete safe.password;
      return json({ lobby: safe });
    }

    // Join by id
    const idJoin = path.match(/^\/api\/lobbies\/([^/]+)\/join$/);
    if (idJoin && request.method === "POST") {
      const id = idJoin[1];
      const body = await request.json().catch(() => ({}));
      const found = await callRegistry(env, "findById", { id });
      if (found.error) return err(found.error, 404);
      const lobby = found.lobby;
      if (lobby.password && lobby.password !== (body.password || "")) {
        return err("Wrong password", 403);
      }
      if (lobby.playerCount >= lobby.maxPlayers) return err("Lobby full", 409);
      const safe = { ...lobby };
      delete safe.password;
      return json({ lobby: safe });
    }

    // WebSocket
    const wsMatch = path.match(/^\/api\/lobbies\/([^/]+)\/ws$/);
    if (wsMatch) {
      const id = wsMatch[1];
      try {
        return await getLobbyRoom(env, id, request);
      } catch (e) {
        return err("Lobby not found", 404);
      }
    }

    // ---- Static files ----
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};
