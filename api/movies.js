const { sendJson } = require("../lib/http");
const { DECK_SIZE, enrichMovies } = require("../lib/movie-catalog");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const movies = await enrichMovies(process.env.OMDB_API_KEY || "");
    sendJson(res, 200, {
      movies,
      omdbLive: Boolean(process.env.OMDB_API_KEY),
      catalogSize: movies.length,
      deckSize: DECK_SIZE
    });
  } catch {
    sendJson(res, 500, { error: "Failed to load movies." });
  }
};
