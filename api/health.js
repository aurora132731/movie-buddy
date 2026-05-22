const { sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  sendJson(res, 200, {
    ok: true,
    omdb: Boolean(process.env.OMDB_API_KEY),
    kv: Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  });
};
