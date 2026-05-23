const POSTER_OVERRIDES = {
  "the-matrix": "https://image.tmdb.org/t/p/w780/f89U3ADr1oiB1s9GpdPQPCY8F8i.jpg",
  goodfellas: "https://image.tmdb.org/t/p/w780/wrsh37QsfcHTzn3KqTaDopQHyKp.jpg",
  "get-out": "https://image.tmdb.org/t/p/w780/1QpO9wo7JWy8VKqldB6cEy6PbKm.jpg",
  whiplash: "https://image.tmdb.org/t/p/w780/lZ1CnXj6lHog835AHz69RAW74K.jpg",
  oppenheimer: "https://image.tmdb.org/t/p/w780/8Gxv8gSFCU0XGDykEGv7zR1n1ua.jpg",
  barbie: "https://image.tmdb.org/t/p/w780/iuFNMS7UfoB1jpMz73xhKd2Yvxp.jpg",
  "shawshank": "https://image.tmdb.org/t/p/w780/q6y0Go1tYve3GqSW7h4i0Yp0Z6x.jpg"
};

function posterSources(movie) {
  const urls = [];
  const add = (url) => {
    if (!url || typeof url !== "string" || url.includes("N/A")) return;
    if (!urls.includes(url)) urls.push(url);
  };

  add(POSTER_OVERRIDES[movie.id]);
  add(movie.poster);

  if (movie.poster?.includes("/w780/")) {
    add(movie.poster.replace("/w780/", "/w500/"));
  }
  if (movie.poster?.includes("/w500/")) {
    add(movie.poster.replace("/w500/", "/w780/"));
  }

  return urls;
}

module.exports = { POSTER_OVERRIDES, posterSources };
