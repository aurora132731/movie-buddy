const crypto = require("crypto");
const { loadMovieCatalog, DECK_SIZE } = require("./movie-catalog");

let kv = null;
try {
  kv = require("@vercel/kv").kv;
} catch {
  kv = null;
}

const ROOM_PREFIX = "room:";
const ROOM_TTL_SECONDS = 60 * 60 * 24 * 7;
const memoryRooms = new Map();
const catalog = loadMovieCatalog();

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDeckMovieIds() {
  return shuffle(catalog)
    .slice(0, Math.min(DECK_SIZE, catalog.length))
    .map((movie) => movie.id);
}

function normalizeRoomCode(code) {
  const digits = String(code || "").replace(/\D/g, "");
  return digits.length === 4 ? digits : null;
}

function randomCode() {
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += String(crypto.randomInt(0, 10));
  }
  return code;
}

function useKv() {
  return Boolean(kv && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readRoom(code) {
  const normalized = normalizeRoomCode(code);
  if (!normalized) return null;

  if (useKv()) {
    return await kv.get(`${ROOM_PREFIX}${normalized}`);
  }
  return memoryRooms.get(normalized) || null;
}

async function writeRoom(room) {
  const normalized = normalizeRoomCode(room.code);
  if (!normalized) return;

  room.code = normalized;
  if (useKv()) {
    await kv.set(`${ROOM_PREFIX}${normalized}`, room, { ex: ROOM_TTL_SECONDS });
    return;
  }
  memoryRooms.set(normalized, room);
}

async function roomCodeExists(code) {
  const room = await readRoom(code);
  return Boolean(room);
}

async function createRoom(hostName) {
  let code = randomCode();
  let attempts = 0;
  while ((await roomCodeExists(code)) && attempts < 50) {
    code = randomCode();
    attempts += 1;
  }

  const hostId = crypto.randomUUID();
  const room = {
    code,
    createdAt: Date.now(),
    movies: pickDeckMovieIds(),
    participants: {
      [hostId]: {
        id: hostId,
        name: hostName || "Host",
        swipes: {},
        joinedAt: Date.now()
      }
    },
    hostId
  };

  await writeRoom(room);
  return { room, participantId: hostId };
}

function computeMatches(room) {
  const participants = Object.values(room.participants);
  if (participants.length < 2) return [];

  return room.movies.filter((movieId) =>
    participants.every((participant) => {
      const vote = participant.swipes[movieId];
      return vote === "like" || vote === "super";
    })
  );
}

function roomPayload(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    participantCount: Object.keys(room.participants).length,
    participants: Object.values(room.participants).map((participant) => ({
      id: participant.id,
      name: participant.name,
      swipeCount: Object.keys(participant.swipes).length,
      swipes: participant.swipes,
      joinedAt: participant.joinedAt
    })),
    matches: computeMatches(room),
    movieIds: room.movies,
    deckSize: room.movies.length
  };
}

async function joinRoom(code, name) {
  const room = await readRoom(code);
  if (!room) return null;

  const guestName = String(name || "Guest").trim().slice(0, 24) || "Guest";
  const existing = Object.values(room.participants).find(
    (participant) => participant.name.toLowerCase() === guestName.toLowerCase()
  );
  if (existing) {
    return { room, participantId: existing.id };
  }

  const participantId = crypto.randomUUID();
  room.participants[participantId] = {
    id: participantId,
    name: guestName,
    swipes: {},
    joinedAt: Date.now()
  };
  await writeRoom(room);
  return { room, participantId };
}

async function applyRoomAction(room, body) {
  const participant = room.participants[body.participantId];
  if (!participant) {
    return { error: "Unknown participant.", status: 403 };
  }

  if (body.action === "swipe") {
    if (!["like", "pass", "super"].includes(body.vote)) {
      return { error: "Invalid vote.", status: 400 };
    }
    participant.swipes[body.movieId] = body.vote;
    await writeRoom(room);
    const matchIds = computeMatches(room);
    return {
      room,
      matched: matchIds.includes(body.movieId),
      matchCount: matchIds.length
    };
  }

  if (body.action === "undo") {
    if (body.movieId && participant.swipes[body.movieId]) {
      delete participant.swipes[body.movieId];
    }
    await writeRoom(room);
    return { room };
  }

  if (body.action === "reset") {
    participant.swipes = {};
    await writeRoom(room);
    return { room };
  }

  return { error: "Unknown action.", status: 400 };
}

module.exports = {
  normalizeRoomCode,
  readRoom,
  writeRoom,
  createRoom,
  joinRoom,
  applyRoomAction,
  roomPayload,
  computeMatches,
  useKv
};
