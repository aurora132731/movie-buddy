const http = require("http");
const fs = require("fs");
const path = require("path");
const { sendJson, readJsonBody } = require("./lib/http");
const { DECK_SIZE, enrichMovies } = require("./lib/movie-catalog");
const {
  normalizeRoomCode,
  readRoom,
  createRoom,
  joinRoom,
  applyRoomAction,
  roomPayload,
  useKv
} = require("./lib/room-store");
const posterHandler = require("./api/poster");

const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || "0.0.0.0";

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function serveStatic(route, response) {
  const filePath = path.resolve(root, `.${route}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      omdb: Boolean(process.env.OMDB_API_KEY),
      kv: useKv()
    });
    return;
  }

  if (url.pathname === "/api/poster" && request.method === "GET") {
    const mockReq = {
      method: "GET",
      query: { movieId: url.searchParams.get("movieId") || "" }
    };
    await posterHandler(mockReq, response);
    return;
  }

  if (url.pathname === "/api/movies" && request.method === "GET") {
    try {
      const movies = await enrichMovies(process.env.OMDB_API_KEY || "");
      sendJson(response, 200, {
        movies,
        omdbLive: Boolean(process.env.OMDB_API_KEY),
        catalogSize: movies.length,
        deckSize: DECK_SIZE
      });
    } catch {
      sendJson(response, 500, { error: "Failed to load movies." });
    }
    return;
  }

  if (url.pathname === "/api/rooms" && request.method === "POST") {
    try {
      const body = await readJsonBody(request);
      const name = String(body.name || "Host").trim().slice(0, 24) || "Host";
      const { room, participantId } = await createRoom(name);
      sendJson(response, 201, { room: roomPayload(room), participantId });
    } catch {
      sendJson(response, 400, { error: "Invalid request body." });
    }
    return;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch) {
    const code = normalizeRoomCode(roomMatch[1]);

    if (!code) {
      sendJson(response, 400, { error: "Enter a valid 4-digit room PIN." });
      return;
    }

    if (request.method === "GET") {
      const room = await readRoom(code);
      if (!room) {
        sendJson(response, 404, {
          error: "Room not found. Check the PIN or ask your friend to start a new game."
        });
        return;
      }
      sendJson(response, 200, { room: roomPayload(room) });
      return;
    }

    if (request.method === "POST") {
      try {
        const body = await readJsonBody(request);

        if (body.action === "join") {
          const joined = await joinRoom(code, body.name);
          if (!joined) {
            sendJson(response, 404, {
              error: "Room not found. Check the PIN or ask your friend to start a new game."
            });
            return;
          }
          sendJson(response, 200, {
            room: roomPayload(joined.room),
            participantId: joined.participantId
          });
          return;
        }

        const room = await readRoom(code);
        if (!room) {
          sendJson(response, 404, { error: "Room not found." });
          return;
        }

        const result = await applyRoomAction(room, body);
        if (result.error) {
          sendJson(response, result.status || 400, { error: result.error });
          return;
        }

        const payload = { room: roomPayload(result.room) };
        if (typeof result.matched === "boolean") {
          payload.matched = result.matched;
          payload.matchCount = result.matchCount;
        }
        sendJson(response, 200, payload);
      } catch {
        sendJson(response, 400, { error: "Invalid request body." });
      }
      return;
    }
  }

  const route = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  serveStatic(route, response);
});

server.listen(port, host, () => {
  console.log(`Movie Buddy is running at http://127.0.0.1:${port}`);
  if (!useKv()) {
    console.log("Rooms are stored in memory (local only). On Vercel, link a KV database for shared rooms.");
  }
  if (!process.env.OMDB_API_KEY) {
    console.log("Tip: set OMDB_API_KEY for live IMDb + Rotten Tomatoes ratings.");
  }
});
