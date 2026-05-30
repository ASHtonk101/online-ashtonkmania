/**
 * LobbyRoom — Durable Object per lobby.
 * Manages WebSocket connections, player list, chat, host transfer, game start.
 */
export class LobbyRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.meta = null; // { id, name, maxPlayers, visibility, password, code, hostId, hostName }
    this.sessions = new Map(); // userId -> { ws, username }
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.meta = (await this.state.storage.get("meta")) || null;
    this.loaded = true;
  }

  async saveMeta() {
    if (this.meta) await this.state.storage.put("meta", this.meta);
  }

  async syncRegistry(extra = {}) {
    if (!this.meta) return;
    const id = this.env.LOBBY_REGISTRY.idFromName("global");
    const stub = this.env.LOBBY_REGISTRY.get(id);
    await stub.fetch("https://registry/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: this.meta.id,
        playerCount: this.sessions.size,
        hostName: this.meta.hostName,
        ...extra,
      }),
    });
  }

  async removeFromRegistry() {
    if (!this.meta) return;
    const id = this.env.LOBBY_REGISTRY.idFromName("global");
    const stub = this.env.LOBBY_REGISTRY.get(id);
    await stub.fetch("https://registry/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: this.meta.id }),
    });
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/init") {
      const body = await request.json();
      this.meta = {
        id: body.id,
        name: body.name,
        maxPlayers: body.maxPlayers,
        visibility: body.visibility,
        password: body.password || "",
        code: body.code,
        hostId: body.hostId,
        hostName: body.hostName,
      };
      await this.saveMeta();
      return Response.json({ ok: true });
    }

    if (path.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      if (!this.meta) return new Response("Lobby not initialized", { status: 404 });

      const userId = url.searchParams.get("userId");
      const username = (url.searchParams.get("username") || "Anon").slice(0, 20);
      if (!userId) return new Response("Missing userId", { status: 400 });

      if (this.sessions.size >= this.meta.maxPlayers && !this.sessions.has(userId)) {
        return new Response("Lobby full", { status: 409 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      await this.handleSession(server, userId, username);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async handleSession(ws, userId, username) {
    ws.accept();

    // Drop any previous connection from same user
    const existing = this.sessions.get(userId);
    if (existing) {
      try { existing.ws.close(1000, "Reconnect"); } catch {}
    }

    this.sessions.set(userId, { ws, username });

    // If lobby has no host (recovered/empty), promote first joiner
    if (!this.meta.hostId || !this.sessions.has(this.meta.hostId)) {
      this.meta.hostId = userId;
      this.meta.hostName = username;
      await this.saveMeta();
    }

    this.broadcastState();
    this.broadcast({ type: "player_joined", userId, username }, userId);

    ws.addEventListener("message", async (evt) => {
      let msg;
      try { msg = JSON.parse(evt.data); } catch { return; }
      await this.handleMessage(userId, msg);
    });

    const close = async () => {
      this.sessions.delete(userId);
      this.broadcast({ type: "player_left", userId, username });

      // Host transfer
      if (this.meta && this.meta.hostId === userId && this.sessions.size > 0) {
        const next = this.sessions.entries().next().value;
        if (next) {
          const [nextId, nextSess] = next;
          this.meta.hostId = nextId;
          this.meta.hostName = nextSess.username;
          await this.saveMeta();
          this.broadcast({ type: "host_changed", userId: nextId, username: nextSess.username });
        }
      }

      if (this.sessions.size === 0) {
        // Lobby empty — schedule cleanup
        this.state.waitUntil(this.cleanupIfEmpty());
      } else {
        this.broadcastState();
        await this.syncRegistry();
      }
    };

    ws.addEventListener("close", close);
    ws.addEventListener("error", close);

    await this.syncRegistry();
  }

  async cleanupIfEmpty() {
    // Wait a bit in case someone reconnects
    await new Promise(r => setTimeout(r, 30000));
    if (this.sessions.size === 0) {
      await this.removeFromRegistry();
      await this.state.storage.deleteAll();
    }
  }

  async handleMessage(userId, msg) {
    const sess = this.sessions.get(userId);
    if (!sess) return;

    switch (msg.type) {
      case "chat": {
        const text = String(msg.text || "").slice(0, 200).trim();
        if (!text) return;
        this.broadcast({ type: "chat", userId, username: sess.username, text });
        break;
      }
      case "start_game": {
        if (userId !== this.meta.hostId) {
          this.sendTo(userId, { type: "error", message: "Only host can start" });
          return;
        }
        this.broadcast({ type: "game_starting" });
        break;
      }
      case "leave": {
        try { sess.ws.close(1000, "Left"); } catch {}
        break;
      }
      case "ping": {
        this.sendTo(userId, { type: "pong" });
        break;
      }
    }
  }

  broadcastState() {
    const players = [...this.sessions.entries()].map(([id, s]) => ({
      id, username: s.username,
    }));
    this.broadcast({
      type: "state",
      players,
      hostId: this.meta.hostId,
    });
  }

  broadcast(msg, exceptUserId = null) {
    const data = JSON.stringify(msg);
    for (const [id, sess] of this.sessions) {
      if (id === exceptUserId) continue;
      try { sess.ws.send(data); } catch {}
    }
  }

  sendTo(userId, msg) {
    const sess = this.sessions.get(userId);
    if (sess) {
      try { sess.ws.send(JSON.stringify(msg)); } catch {}
    }
  }
}
