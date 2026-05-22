const { sendJson, readJsonBody } = require("../../lib/http");
const {
  normalizeRoomCode,
  readRoom,
  applyRoomAction,
  roomPayload,
  joinRoom
} = require("../../lib/room-store");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const code = normalizeRoomCode(req.query.code);
  if (!code) {
    sendJson(res, 400, { error: "Enter a valid 4-digit room PIN." });
    return;
  }

  if (req.method === "GET") {
    const room = await readRoom(code);
    if (!room) {
      sendJson(res, 404, { error: "Room not found. Check the PIN or ask your friend to start a new game." });
      return;
    }
    sendJson(res, 200, { room: roomPayload(room) });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await readJsonBody(req);

    if (body.action === "join") {
      const joined = await joinRoom(code, body.name);
      if (!joined) {
        sendJson(res, 404, { error: "Room not found. Check the PIN or ask your friend to start a new game." });
        return;
      }
      sendJson(res, 200, {
        room: roomPayload(joined.room),
        participantId: joined.participantId
      });
      return;
    }

    const room = await readRoom(code);
    if (!room) {
      sendJson(res, 404, { error: "Room not found." });
      return;
    }

    const result = await applyRoomAction(room, body);
    if (result.error) {
      sendJson(res, result.status || 400, { error: result.error });
      return;
    }

    const payload = { room: roomPayload(result.room) };
    if (typeof result.matched === "boolean") {
      payload.matched = result.matched;
      payload.matchCount = result.matchCount;
    }
    sendJson(res, 200, payload);
  } catch {
    sendJson(res, 400, { error: "Invalid request body." });
  }
};
