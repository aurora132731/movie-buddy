const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const postersPath = path.join(root, "posters.json");
const manifestPath = path.join(root, "posters-manifest.json");

let POSTER_URLS = {};
let POSTER_LOCAL = {};

if (fs.existsSync(postersPath)) {
  POSTER_URLS = JSON.parse(fs.readFileSync(postersPath, "utf8"));
}

if (fs.existsSync(manifestPath)) {
  POSTER_LOCAL = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function posterSources(movie) {
  const urls = [];
  const add = (url) => {
    if (!url || typeof url !== "string" || url.includes("N/A")) return;
    if (!urls.includes(url)) urls.push(url);
  };

  add(POSTER_LOCAL[movie.id]);
  add(POSTER_URLS[movie.id]);
  const amazon = POSTER_URLS[movie.id];
  if (amazon?.includes("SX300")) {
    add(amazon.replace("SX300", "UX1000"));
  }
  add(movie.poster);

  if (movie.poster?.includes("/w780/")) {
    add(movie.poster.replace("/w780/", "/w500/"));
  }

  return urls;
}

function primaryPosterUrl(movie) {
  return POSTER_LOCAL[movie.id] || POSTER_URLS[movie.id] || movie.poster || null;
}

module.exports = { POSTER_URLS, POSTER_LOCAL, posterSources, primaryPosterUrl };
