
export class Matchmaker {
  constructor(state) {
    this.state = state;
    this.queue = [];
  }

  async fetch(request) {
    const data = await request.json();
    this.queue.push(data.name);

    if (this.queue.length >= 2) {
      const p1 = this.queue.shift();
      const p2 = this.queue.shift();

      const code = Math.random().toString(36).substring(2,7).toUpperCase();

      return Response.json({ code, players:[p1,p2] });
    }

    return Response.json({ waiting:true });
  }
}
