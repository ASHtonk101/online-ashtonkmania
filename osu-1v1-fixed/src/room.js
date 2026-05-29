
export class Room {
  constructor(state) {
    this.state = state;
    this.clients = [];
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    server.accept();
    this.clients.push(server);

    server.send("Connected");

    server.addEventListener("message", (e) => {
      for (const c of this.clients) {
        if (c.readyState === 1) c.send(e.data);
      }
    });

    server.addEventListener("close", () => {
      this.clients = this.clients.filter(c => c !== server);
    });

    return new Response(null, { status:101, webSocket: client });
  }
}
