/**
 * LobbyRegistry — single global Durable Object that tracks all active lobbies.
 * Stores lightweight metadata for browsing. Real session state lives in LobbyRoom.
 */
export class LobbyRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.lobbies = new Map(); // id -> lobby meta
    this.codeIndex = new Map(); // CODE -> id
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const stored = await this.state.storage.get("lobbies");
    if (stored) {
      for (const [id, lobby] of Object.entries(stored)) {
        this.lobbies.set(id, lobby);
        if (lobby.code) this.codeIndex.set(lobby.code, id);
      }
    }
    this.loaded = true;
  }

  async persist() {
    const obj = {};
    for (const [id, l] of this.lobbies) obj[id] = l;
    await this.state.storage.put("lobbies", obj);
  }

  generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
    let code;
    do {
      code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    } while (this.codeIndex.has(code));
    return code;
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\//, "");
    const body = await request.json().catch(() => ({}));

    switch (action) {
      case "list": {
        const now = Date.now();
        // Prune stale lobbies (>10min no heartbeat)
        for (const [id, l] of [...this.lobbies]) {
          if (now - (l.lastSeen || l.createdAt) > 10 * 60 * 1000) {
            this.lobbies.delete(id);
            if (l.code) this.codeIndex.delete(l.code);
          }
        }
        const list = [...this.lobbies.values()]
          .filter(l => l.visibility === "public")
          .map(l => ({
            id: l.id,
            name: l.name,
            hostName: l.hostName,
            maxPlayers: l.maxPlayers,
            playerCount: l.playerCount || 1,
            hasPassword: !!l.password,
            visibility: l.visibility,
            createdAt: l.createdAt,
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        return Response.json({ lobbies: list });
      }

      case "create": {
        const { lobbyDoId, name, maxPlayers, visibility, password, hostId, hostName } = body;
        const code = this.generateCode();
        const lobby = {
          id: lobbyDoId,
          name,
          maxPlayers,
          visibility,
          password: password || "",
          code,
          hostId,
          hostName,
          playerCount: 1,
          createdAt: Date.now(),
          lastSeen: Date.now(),
        };
        this.lobbies.set(lobbyDoId, lobby);
        this.codeIndex.set(code, lobbyDoId);
        await this.persist();
        return Response.json({ lobby });
      }

      case "findById": {
        const lobby = this.lobbies.get(body.id);
        if (!lobby) return Response.json({ error: "Not found" });
        return Response.json({ lobby });
      }

      case "findByCode": {
        const id = this.codeIndex.get(String(body.code || "").toUpperCase());
        if (!id) return Response.json({ error: "Invalid code" });
        const lobby = this.lobbies.get(id);
        if (!lobby) return Response.json({ error: "Lobby gone" });
        return Response.json({ lobby });
      }

      case "update": {
        const lobby = this.lobbies.get(body.id);
        if (!lobby) return Response.json({ ok: false });
        if (typeof body.playerCount === "number") lobby.playerCount = body.playerCount;
        if (typeof body.hostName === "string") lobby.hostName = body.hostName;
        lobby.lastSeen = Date.now();
        await this.persist();
        return Response.json({ ok: true });
      }

      case "remove": {
        const lobby = this.lobbies.get(body.id);
        if (lobby) {
          this.lobbies.delete(body.id);
          if (lobby.code) this.codeIndex.delete(lobby.code);
          await this.persist();
        }
        return Response.json({ ok: true });
      }
    }
    return new Response("Unknown action", { status: 400 });
  }
}
