
import { Room } from "./room.js";
import { Matchmaker } from "./matchmaker.js";

export { Room, Matchmaker };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/queue") {
      const mm = env.MATCHMAKER.get(env.MATCHMAKER.idFromName("global"));
      return mm.fetch(request);
    }

    if (url.pathname.startsWith("/ws/")) {
      const code = url.pathname.split("/")[2];
      const id = env.ROOMS.idFromName(code);
      return env.ROOMS.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
