const fs = require("fs");
const path = require("path");

const DECK_SIZE = 30;
const root = path.join(__dirname, "..");

function loadMovieCatalog() {
  const base = JSON.parse(fs.readFileSync(path.join(root, "movies.json"), "utf8"));
  const extraPath = path.join(root, "movies-extra.json");
  const extra = fs.existsSync(extraPath)
    ? JSON.parse(fs.readFileSync(extraPath, "utf8"))
    : [];
  const byId = new Map();
  [...base, ...extra].forEach((movie) => byId.set(movie.id, movie));
  return [...byId.values()];
}

function formatRuntime(runtime) {
  if (!runtime) return null;
  if (runtime.includes("h")) return runtime;
  const minutes = Number(runtime.replace(/\D/g, ""));
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function buildGallery(movie, posterUrl) {
  const poster = posterUrl || movie.poster;
  const videoId = movie.trailerYouTubeId;
  const stillUrls = [
    poster,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/0.jpg`,
    `https://i.ytimg.com/vi/${videoId}/1.jpg`,
    `https://i.ytimg.com/vi/${videoId}/2.jpg`,
    `https://i.ytimg.com/vi/${videoId}/3.jpg`
  ];

  const labels = ["Highlight", "Trailer still", "Scene", "Cast moment", "Sneak peek"];
  const seen = new Set();
  const scenes = [];

  stillUrls.forEach((image, index) => {
    if (!image || seen.has(image)) return;
    seen.add(image);
    const castName = movie.cast[index % movie.cast.length];
    scenes.push({
      image,
      label: index === 0 ? "Highlight" : index < 3 ? labels[index] : `Cast · ${castName}`,
      caption: index === 0 ? "Official poster" : "Preview from trailer & stills"
    });
  });

  return scenes.slice(0, 10);
}

function preserveMovieIdentity(movie, patch = {}) {
  return {
    ...movie,
    ...patch,
    id: movie.id,
    imdbId: movie.imdbId
  };
}

function parseRatingValue(value) {
  if (!value) return null;
  const match = String(value).match(/([\d.]+)/);
  return match ? Number(match[1]) : null;
}

function parseTomatoValue(value) {
  if (!value) return null;
  const match = String(value).match(/(\d+)%/);
  return match ? Number(match[1]) : null;
}

async function fetchOmdb(imdbId, apiKey, cache) {
  if (cache.has(imdbId)) {
    return cache.get(imdbId);
  }

  if (!apiKey) {
    return null;
  }

  const url = `https://www.omdbapi.com/?i=${imdbId}&apikey=${apiKey}&plot=full`;
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (data.Response === "False") {
    return null;
  }

  const imdbRating = (data.Ratings || []).find((entry) =>
    entry.Source.includes("Internet Movie Database")
  );
  const tomatoRating = (data.Ratings || []).find((entry) =>
    entry.Source.includes("Rotten Tomatoes")
  );

  const enriched = {
    rating: parseRatingValue(imdbRating?.Value ?? data.imdbRating),
    tomato: parseTomatoValue(tomatoRating?.Value),
    imdbVotes: data.imdbVotes || null,
    runtime: formatRuntime(data.Runtime),
    overview: data.Plot && data.Plot !== "N/A" ? data.Plot : null,
    cast: data.Actors && data.Actors !== "N/A" ? data.Actors.split(", ") : null,
    genres:
      data.Genre && data.Genre !== "N/A" ? data.Genre.split(", ") : null,
    year: data.Year && data.Year !== "N/A" ? Number(String(data.Year).slice(0, 4)) : null,
    title: data.Title && data.Title !== "N/A" ? data.Title : null,
    poster: data.Poster && data.Poster !== "N/A" ? data.Poster : null
  };

  cache.set(imdbId, enriched);
  return enriched;
}

async function enrichMovie(movie, apiKey, cache) {
  const omdb = await fetchOmdb(movie.imdbId, apiKey, cache);
  const omdbPoster =
    omdb?.poster && omdb.poster !== "N/A" && !omdb.poster.includes("N/A") ? omdb.poster : null;
  const poster = movie.poster || omdbPoster;

  if (!omdb) {
    return preserveMovieIdentity(movie, {
      poster,
      scenes: buildGallery(movie, poster),
      rating: movie.rating ?? null,
      tomato: movie.tomato ?? null,
      imdbVotes: movie.imdbVotes ?? null
    });
  }

  return preserveMovieIdentity(movie, {
    poster,
    imdbVideoId: movie.imdbVideoId,
    scenes: buildGallery(movie, poster),
    title: omdb.title || movie.title,
    year: omdb.year || movie.year,
    runtime: formatRuntime(omdb.runtime) || movie.runtime,
    rating: omdb.rating ?? movie.rating ?? null,
    tomato: omdb.tomato ?? movie.tomato ?? null,
    imdbVotes: omdb.imdbVotes || movie.imdbVotes || null,
    overview: omdb.overview || movie.overview,
    cast: omdb.cast || movie.cast,
    genres: omdb.genres || movie.genres
  });
}

async function enrichMovies(apiKey) {
  const catalog = loadMovieCatalog();
  const cache = new Map();
  return Promise.all(catalog.map((movie) => enrichMovie(movie, apiKey, cache)));
}

module.exports = {
  DECK_SIZE,
  loadMovieCatalog,
  enrichMovies
};
