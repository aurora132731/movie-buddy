const fs = require("fs");
const path = require("path");
const { loadMovieCatalog } = require("../lib/movie-catalog");
const { posterSources } = require("../lib/poster-resolve");

const catalogById = new Map(loadMovieCatalog().map((movie) => [movie.id, movie]));
const postersPath = path.join(__dirname, "..", "posters.json");
const POSTER_URLS = fs.existsSync(postersPath)
  ? JSON.parse(fs.readFileSync(postersPath, "utf8"))
  : {};

async function fetchPosterBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "MovieBuddy/1.0 (+https://vercel.com)",
      Accept: "image/*"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    return null;
  }

  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 1200) {
    return null;
  }

  return { buffer, type };
}

function sendImage(res, buffer, type) {
  const headers = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*"
  };

  if (typeof res.status === "function" && typeof res.send === "function") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", headers["Cache-Control"]);
    res.status(200).send(buffer);
    return;
  }

  res.writeHead(200, headers);
  res.end(buffer);
}

function sendError(res, status, message) {
  const payload = JSON.stringify({ error: message });
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(status).json({ error: message });
    return;
  }
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(payload);
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    if (typeof res.status === "function") {
      res.status(204).end();
      return;
    }
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendError(res, 405, "Method not allowed.");
    return;
  }

  const movieId = String(req.query.movieId || "").trim();
  const movie = catalogById.get(movieId);

  if (!movie) {
    sendError(res, 404, "Movie not found.");
    return;
  }

  for (const url of posterSources(movie)) {
    try {
      const result = await fetchPosterBuffer(url);
      if (result) {
        sendImage(res, result.buffer, result.type);
        return;
      }
    } catch {
      // try next source
    }
  }

  sendError(res, 404, "Poster unavailable.");
};
