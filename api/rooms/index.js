const { sendJson, readJsonBody } = require("../../lib/http");
const { createRoom, roomPayload } = require("../../lib/room-store");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const name = String(body.name || "Host").trim().slice(0, 24) || "Host";
    const { room, participantId } = await createRoom(name);
    sendJson(res, 201, { room: roomPayload(room), participantId });
  } catch {
    sendJson(res, 400, { error: "Invalid request body." });
  }
};
