const STORAGE_KEY = "movie-buddy-session-v2";
const POLL_MS = 2000;
const POLL_MS_MENU = 1000;

let movies = [];
let drag = null;
let pollTimer = null;
const defaultSession = {
  participantId: null,
  participantName: null,
  roomCode: null,
  media: {},
  undoStack: [],
  screen: "home"
};

let session = loadSession();
let roomState = null;

const screens = {
  home: document.querySelector("#screen-home"),
  join: document.querySelector("#screen-join"),
  lobby: document.querySelector("#screen-lobby"),
  swipe: document.querySelector("#screen-swipe"),
  matches: document.querySelector("#screen-matches"),
  lists: document.querySelector("#screen-lists")
};

const deck = document.querySelector("#deck");
const progressLabel = document.querySelector("#progress-label");
const matchCountLabel = document.querySelector("#match-count-label");
const matchesList = document.querySelector("#matches-list");
const likedList = document.querySelector("#liked-list");
const passedList = document.querySelector("#passed-list");
const modal = document.querySelector("#movie-modal");
const modalContent = document.querySelector("#modal-content");
const matchToast = document.querySelector("#match-toast");
const bottomNav = document.querySelector("#bottom-nav");
const nameModal = document.querySelector("#name-modal");
const pinPadModal = document.querySelector("#pin-pad-modal");
const pinHiddenInput = document.querySelector("#join-pin");
const pinSlotsButton = document.querySelector("#pin-slots");
let pinDigits = ["", "", "", ""];

function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...defaultSession, ...saved } : structuredClone(defaultSession);
  } catch {
    return structuredClone(defaultSession);
  }
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function api(path, options = {}) {
  const response = await fetch(`${window.location.origin}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function isPositiveSwipe(vote) {
  return vote === "like" || vote === "super";
}

function imdbUrl(movie) {
  return `https://www.imdb.com/title/${movie.imdbId}/`;
}

function rottenTomatoesUrl(movie) {
  return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title)}`;
}

function justWatchUrl(movie) {
  return `https://www.justwatch.com/us/search?q=${encodeURIComponent(`${movie.title} ${movie.year}`)}`;
}

function wikipediaActorUrl(name) {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(name.trim().replace(/\s+/g, "_"))}`;
}

function formatImdbVotes(votes) {
  if (!votes) return "";
  const raw = String(votes).trim();
  if (/^[\d,]+$/.test(raw)) {
    const count = Number(raw.replace(/,/g, ""));
    if (count >= 1_000_000) {
      const millions = count / 1_000_000;
      return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
    }
    if (count >= 1_000) {
      return `${Math.round(count / 1_000)}K`;
    }
    return raw;
  }
  return raw.replace(/\+$/, "");
}

function formatImdbRatingText(movie) {
  const score = typeof movie.rating === "number" ? movie.rating.toFixed(1) : "—";
  const votes = formatImdbVotes(movie.imdbVotes);
  return votes ? `${score}/10 ${votes}` : `${score}/10`;
}

function renderMovieMeta(movie, linked = true) {
  const score = typeof movie.rating === "number" ? movie.rating.toFixed(1) : "—";
  const votes = formatImdbVotes(movie.imdbVotes);
  const imdbInner = `<span class="pill-star" aria-hidden="true">★</span><strong>${score}</strong>/10${votes ? ` ${votes}` : ""}`;

  const imdbTag = linked
    ? `<a class="pill pill-imdb" href="${imdbUrl(movie)}" target="_blank" rel="noreferrer">${imdbInner}</a>`
    : `<span class="pill pill-imdb">${imdbInner}</span>`;

  const rtTag = linked
    ? `<a class="pill pill-rt" href="${rottenTomatoesUrl(movie)}" target="_blank" rel="noreferrer">🍅 ${formatTomato(movie)}</a>`
    : `<span class="pill pill-rt">🍅 ${formatTomato(movie)}</span>`;

  return `${imdbTag}${rtTag}<span class="pill pill-year">${movie.year}</span><span class="pill pill-runtime">${movie.runtime}</span><span class="pill pill-genre">${movie.genres.join(" / ")}</span>`;
}

function renderCastRow(cast) {
  return cast
    .map(
      (actor, index) =>
        `${index ? '<span class="cast-sep" aria-hidden="true">·</span>' : ""}<a class="cast-link" href="${wikipediaActorUrl(actor)}" target="_blank" rel="noreferrer">${actor}</a>`
    )
    .join("");
}

function wireMetaLinks(container) {
  container?.querySelectorAll(".movie-meta a").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
}

const TRAILER_OVERRIDES = {
  "dark-knight": "EXeTwQWrcwY"
};

let trailerMessageHandler = null;

function trailerThumb(movie) {
  const videoId = trailerIdsFor(movie)[0];
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

function trailerIdsFor(movie) {
  const ids = [];
  const push = (id) => {
    if (typeof id === "string" && id.length === 11 && !ids.includes(id)) ids.push(id);
  };
  push(TRAILER_OVERRIDES[movie.id]);
  push(movie.trailerYouTubeId);
  (movie.trailerAltIds || []).forEach(push);
  return ids;
}

function trailerEmbedUrl(videoId) {
  const origin = encodeURIComponent(window.location.origin);
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${origin}`;
}

function stopTrailerPlayback() {
  if (trailerMessageHandler) {
    window.removeEventListener("message", trailerMessageHandler);
    trailerMessageHandler = null;
  }
}

function showModalTrailerFallback(movie, attempt) {
  const block = modalContent.querySelector(".trailer-block");
  if (!block) return;

  const hasAlt = attempt + 1 < trailerIdsFor(movie).length;
  block.innerHTML = `
    <h3>Trailer</h3>
    <p class="trailer-error">${hasAlt ? "Trying another trailer…" : "This trailer cannot play here. Tap play to try again."}</p>
    ${renderModalTrailer(movie)}
  `;
  block.querySelector("[data-modal-play]")?.addEventListener("click", () => playModalTrailer(movie, hasAlt ? attempt + 1 : 0));
}

function playModalTrailer(movie, attempt = 0) {
  const block = modalContent.querySelector(".trailer-block");
  if (!block) return;

  const ids = trailerIdsFor(movie);
  const videoId = ids[attempt];
  if (!videoId) {
    showModalTrailerFallback(movie, attempt);
    return;
  }

  stopTrailerPlayback();
  block.innerHTML = `
    <h3>Trailer</h3>
    <div class="modal-trailer playing">
      <iframe
        src="${trailerEmbedUrl(videoId)}"
        title="${movie.title} trailer"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      ></iframe>
    </div>
  `;

  trailerMessageHandler = (event) => {
    if (!event.origin.includes("youtube")) return;
    let data;
    try {
      data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }

    const embedBlocked = data?.event === "onError" || [100, 101, 150, 2, 5].includes(data?.info);
    if (!embedBlocked) return;

    stopTrailerPlayback();
    if (attempt + 1 < ids.length) {
      playModalTrailer(movie, attempt + 1);
      return;
    }
    showModalTrailerFallback(movie, attempt);
  };
  window.addEventListener("message", trailerMessageHandler);
}

function roomMovieIds() {
  if (roomState?.movieIds?.length) return roomState.movieIds;
  if (roomState?.movies?.length) return roomState.movies;
  return movies.map((movie) => movie.id);
}

function findMovieForRoomId(roomMovieId) {
  return movies.find((movie) => movie.id === roomMovieId || movie.imdbId === roomMovieId);
}

function deckMovies() {
  const seen = new Set();
  const list = [];
  roomMovieIds().forEach((roomMovieId) => {
    const movie = findMovieForRoomId(roomMovieId);
    if (movie && !seen.has(movie.id)) {
      seen.add(movie.id);
      list.push(movie);
    }
  });
  return list;
}

function formatTomato(movie) {
  return typeof movie.tomato === "number" ? `${movie.tomato}%` : "—";
}

const SCENE_LABELS = ["Highlight", "Key moment", "Cast moment", "Sneak peek"];

function sceneItems(movie) {
  return (movie.scenes || []).slice(0, 10).map((scene, index) => {
    if (typeof scene === "string") {
      const castName = movie.cast[index % movie.cast.length];
      const label =
        index === 0 ? "Highlight" : index === 1 ? `Cast · ${castName}` : SCENE_LABELS[index % SCENE_LABELS.length];
      return { image: scene, label, caption: "" };
    }
    return {
      image: scene.image,
      label: scene.label || SCENE_LABELS[index % SCENE_LABELS.length],
      caption: scene.caption || ""
    };
  });
}

function buildGalleryFallback(movie) {
  const videoId = trailerIdsFor(movie)[0];
  const stillUrls = [
    movie.poster,
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/0.jpg`,
    `https://i.ytimg.com/vi/${videoId}/1.jpg`,
    `https://i.ytimg.com/vi/${videoId}/2.jpg`,
    `https://i.ytimg.com/vi/${videoId}/3.jpg`
  ];
  const seen = new Set();
  return stillUrls
    .filter((url) => url && !seen.has(url) && seen.add(url))
    .slice(0, 10)
    .map((image, index) => ({
      image,
      label: index === 0 ? "Highlight" : `Sneak peek ${index}`,
      caption: ""
    }));
}

function mediaItems(movie) {
  const gallery = movie.scenes?.length ? sceneItems(movie) : buildGalleryFallback(movie);
  const videoId = trailerIdsFor(movie)[0];
  const trailerThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const seen = new Set([movie.poster]);
  const items = [
    { type: "poster", label: "Poster", image: movie.poster },
    {
      type: "trailer",
      label: "Trailer",
      image: trailerThumb,
      videoId
    }
  ];

  gallery.forEach((scene) => {
    if (!scene.image || seen.has(scene.image)) return;
    seen.add(scene.image);
    items.push({
      type: "scene",
      label: scene.label,
      caption: scene.caption,
      image: scene.image
    });
  });

  return items;
}

const moviePosterFallback = "https://i.ytimg.com/vi/tFMo3UJ4B4g/hqdefault.jpg";

function imageTag(src, alt, className, fallback) {
  const fb = fallback || moviePosterFallback;
  return `<img class="${className}" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.src='${fb}'" />`;
}

function getMediaIndex(movie) {
  const count = mediaItems(movie).length;
  const index = session.media[movie.id] || 0;
  return Math.max(0, Math.min(index, count - 1));
}

function changeMedia(movie, direction) {
  const count = mediaItems(movie).length;
  const next = getMediaIndex(movie) + direction;
  if (next < 0 || next >= count) return;
  session.media[movie.id] = next;
  saveSession();
  const card = deck.querySelector(`.movie-card[data-movie-id="${movie.id}"]`);
  if (card) {
    updateCardMedia(card, movie);
  } else {
    renderDeck();
  }
}

function updateCardMedia(card, movie) {
  const media = mediaItems(movie);
  const mediaIndex = getMediaIndex(movie);
  const activeMedia = media[mediaIndex];
  const stage = card.querySelector(".card-media-stage");
  if (!stage) return;

  stage.querySelector(".media-content").innerHTML = renderCardMedia(movie, activeMedia);
  stage.querySelector(".media-label").textContent = activeMedia.label;
  stage.querySelectorAll(".media-dots span").forEach((dot, index) => {
    dot.classList.toggle("active", index === mediaIndex);
  });

  const leftZone = stage.querySelector(".media-zone-left");
  const rightZone = stage.querySelector(".media-zone-right");
  leftZone.disabled = mediaIndex === 0;
  rightZone.disabled = mediaIndex >= media.length - 1;
  bindTrailerPlay(stage, movie, activeMedia);
}

function bindTrailerPlay(stage, movie, activeMedia) {
  const playBtn = stage.querySelector("[data-play-trailer]");
  if (!playBtn) return;
  playBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const content = stage.querySelector(".media-content");
    content.innerHTML = renderCardMedia(movie, activeMedia, true);
  });
}

function mySwipes() {
  const me = roomState?.participants?.find((entry) => entry.id === session.participantId);
  return me?.swipes || {};
}

function currentMovie() {
  return deckMovies().find((movie) => !mySwipes()[movie.id]);
}

function matchedMovies() {
  if (!roomState?.matches?.length) return [];
  return deckMovies().filter((movie) => roomState.matches.includes(movie.id));
}

function pinValue() {
  return pinDigits.join("");
}

function renderPinSlots() {
  const value = pinValue();
  pinHiddenInput.value = value;
  document.querySelectorAll(".pin-slot[data-slot]").forEach((slot) => {
    const index = Number(slot.dataset.slot);
    const digit = pinDigits[index] || "";
    slot.textContent = digit || "·";
    slot.classList.toggle("filled", Boolean(digit));
  });
  document.querySelectorAll(".pin-slot[data-modal-slot]").forEach((slot) => {
    const index = Number(slot.dataset.modalSlot);
    const digit = pinDigits[index] || "";
    slot.textContent = digit || "·";
    slot.classList.toggle("filled", Boolean(digit));
  });
}

function setPinDigits(nextDigits) {
  pinDigits = nextDigits.slice(0, 4);
  while (pinDigits.length < 4) pinDigits.push("");
  renderPinSlots();
}

function openPinPad() {
  renderPinSlots();
  pinPadModal.showModal();
}

function showScreen(name) {
  session.screen = name;
  saveSession();
  Object.entries(screens).forEach(([key, element]) => {
    element.classList.toggle("active", key === name);
  });
  if (session.roomCode && ["lobby", "swipe", "matches", "lists"].includes(name)) {
    startPolling();
  }
  const showNav = Boolean(session.roomCode) && !["home", "join", "lobby"].includes(name);
  bottomNav.classList.toggle("hidden", !showNav);
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === name);
  });
}

function roomShareUrl(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("room", code);
  return url.toString();
}

function readRoomFromUrl() {
  const raw = new URL(window.location.href).searchParams.get("room");
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 4 ? digits : null;
}

async function loadLocalCatalog() {
  const base = await fetch("/movies.json").then((r) => r.json());
  let extra = [];
  try {
    extra = await fetch("/movies-extra.json").then((r) => r.json());
  } catch {
    extra = [];
  }
  const byId = new Map();
  [...base, ...extra].forEach((movie) => {
    if (movie?.id) byId.set(movie.id, movie);
  });
  return [...byId.values()].map((movie) => {
    const trailerYouTubeId = TRAILER_OVERRIDES[movie.id] || movie.trailerYouTubeId;
    const patched = { ...movie, trailerYouTubeId };
    return {
      ...patched,
      scenes: patched.scenes?.length ? patched.scenes : buildGalleryFallback(patched)
    };
  });
}

async function loadMovies() {
  const localCatalog = await loadLocalCatalog();
  const localByImdb = new Map(localCatalog.map((movie) => [movie.imdbId, movie]));

  try {
    const payload = await api("/api/movies");
    movies = payload.movies.map((movie) => {
      const local = localByImdb.get(movie.imdbId);
      const stableId = local?.id || (movie.id?.startsWith("tt") ? null : movie.id);
      return {
        ...(local || {}),
        ...movie,
        id: stableId || movie.id,
        imdbId: movie.imdbId,
        scenes: movie.scenes?.length ? movie.scenes : buildGalleryFallback(local || movie)
      };
    });
  } catch {
    movies = localCatalog;
  }
}

async function hydrateRoomDetails() {
  if (!session.roomCode) {
    roomState = null;
    return;
  }
  const payload = await api(`/api/rooms/${session.roomCode}`);
  roomState = payload.room;
}

async function createRoom(name) {
  const payload = await api("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  session.roomCode = payload.room.code;
  session.participantId = payload.participantId;
  session.participantName = name;
  saveSession();
  history.replaceState({}, "", roomShareUrl(session.roomCode));
  await hydrateRoomDetails();
  showScreen("lobby");
  renderLobby();
  startPolling();
}

async function joinRoom(code, name) {
  const payload = await api(`/api/rooms/${code}`, {
    method: "POST",
    body: JSON.stringify({ action: "join", name })
  });
  session.roomCode = payload.room.code;
  session.participantId = payload.participantId;
  session.participantName = name;
  saveSession();
  history.replaceState({}, "", roomShareUrl(session.roomCode));
  await hydrateRoomDetails();
  showScreen("lobby");
  renderLobby();
  startPolling();
}

async function refreshRoomSafe() {
  if (!session.roomCode) return;
  try {
    const previousMatches = [...(roomState?.matches || [])];
    await hydrateRoomDetails();

    const newMatchId = roomState.matches.find((id) => !previousMatches.includes(id));
    if (newMatchId) {
      const movie = movies.find((entry) => entry.id === newMatchId);
      if (movie) showMatchToast(movie, "New match");
    }

    if (session.screen === "lobby") renderLobby();
    else if (["swipe", "matches", "lists"].includes(session.screen)) render();
  } catch {
    stopPolling();
  }
}

function startPolling() {
  stopPolling();
  const interval = session.screen === "lobby" ? POLL_MS_MENU : POLL_MS;
  pollTimer = window.setInterval(refreshRoomSafe, interval);
}

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function leaveRoom() {
  stopPolling();
  session.roomCode = null;
  session.participantId = null;
  session.participantName = null;
  session.media = {};
  roomState = null;
  saveSession();
  history.replaceState({}, "", window.location.pathname);
  showScreen("home");
}

async function postSwipe(movieId, vote) {
  const payload = await api(`/api/rooms/${session.roomCode}`, {
    method: "POST",
    body: JSON.stringify({
      action: "swipe",
      participantId: session.participantId,
      movieId,
      vote
    })
  });
  roomState = payload.room;
  await hydrateRoomDetails();
  return payload;
}

async function resetMySwipes() {
  await api(`/api/rooms/${session.roomCode}`, {
    method: "POST",
    body: JSON.stringify({
      action: "reset",
      participantId: session.participantId
    })
  });
  await hydrateRoomDetails();
  render();
}

function renderLobby() {
  if (!session.roomCode || !roomState) return;
  document.querySelector("#room-pin").textContent = session.roomCode;
  document.querySelector("#share-link").value = roomShareUrl(session.roomCode);

  const players = roomState.participants || [];
  const list = document.querySelector("#player-list");
  list.innerHTML = players
    .map(
      (player) =>
        `<li class="${player.id === session.participantId ? "you" : ""}">${player.name}${
          player.id === session.participantId ? " (you)" : ""
        }</li>`
    )
    .join("");

  const status = document.querySelector("#lobby-status");
  const banner = document.querySelector("#waiting-banner");
  const startButton = document.querySelector("#enter-swipe-button");
  const deckSize = roomState.deckSize || roomMovieIds().length;
  const ready = players.length >= 2;

  banner.classList.toggle("ready", ready);
  if (ready) {
    status.textContent = `${players.length} players in the room · ${deckSize} movies ready — start when you are.`;
    startButton.disabled = false;
    startButton.textContent = "Start swiping";
  } else {
    status.textContent = `Share PIN ${session.roomCode} with a friend. ${deckSize} movies are locked in for this room.`;
    startButton.disabled = true;
    startButton.textContent = "Waiting for a friend…";
  }
}

function render() {
  if (session.screen === "lobby") {
    renderLobby();
    return;
  }
  renderDeck();
  renderMatches();
  renderLists();
}

function renderDeck() {
  const movie = currentMovie();
  const ratedCount = Object.keys(mySwipes()).length;
  const matchCount = roomState?.matches?.length || 0;

  const deckSize = roomMovieIds().length;
  progressLabel.textContent = `${ratedCount} of ${deckSize} rated by ${session.participantName || "you"}`;
  matchCountLabel.textContent = `${matchCount} ${matchCount === 1 ? "match" : "matches"}`;
  deck.innerHTML = "";

  if (!movie) {
    const deckList = deckMovies();
    if (deckList.length === 0 && deckSize > 0) {
      deck.innerHTML = `
        <div class="empty-state finished">
          <h3>Movies not loaded</h3>
          <p>This room has ${deckSize} movies but the app could not match them. Restart the server with start-movie-matcher.cmd, then create a new room.</p>
          <button class="primary-button" type="button" id="reload-movies-button">Reload movies</button>
        </div>
      `;
      document.querySelector("#reload-movies-button")?.addEventListener("click", async () => {
        await loadMovies();
        await hydrateRoomDetails();
        render();
      });
      return;
    }
    deck.innerHTML = `
      <div class="empty-state finished">
        <h3>${ratedCount > 0 ? "All caught up" : "No movies to swipe"}</h3>
        <p>${
          ratedCount > 0
            ? "You have rated every movie in this room. Open Matches to see what you and your friend agreed on."
            : "Create a new room from the Menu to get a fresh shuffled deck."
        }</p>
      </div>
    `;
    return;
  }

  const stack = deckMovies().filter((candidate) => !mySwipes()[candidate.id]).slice(0, 3).reverse();

  stack.forEach((candidate, index) => {
    const card = document.createElement("article");
    const depth = stack.length - index - 1;
    const isTopCard = candidate.id === movie.id;

    card.className = "movie-card";
    card.dataset.movieId = candidate.id;
    card.style.transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.035})`;
    card.style.zIndex = String(index + 1);
    card.innerHTML = `
      <div class="card-media-stage">
        <div class="media-content">${renderMainPoster(candidate)}</div>
      </div>
      <div class="card-footer">
        <div class="card-copy" role="button" tabindex="0" aria-label="Open ${candidate.title} overview">
          <h3>${candidate.title}</h3>
          <div class="movie-meta">${renderMovieMeta(candidate)}</div>
        </div>
        ${
          isTopCard
            ? `
              <div class="tinder-actions" aria-label="Swipe actions">
                <button class="round-action rewind" data-action="rewind" type="button" aria-label="Undo last swipe">↺</button>
                <div class="tinder-actions-main">
                  <button class="round-action main reject" data-action="pass" type="button" aria-label="Pass">✕</button>
                  <button class="round-action main super" data-action="super" type="button" aria-label="Super like">★</button>
                  <button class="round-action main like" data-action="like" type="button" aria-label="Like">♥</button>
                </div>
              </div>
            `
            : ""
        }
      </div>
    `;

    if (isTopCard) {
      const stage = card.querySelector(".card-media-stage");
      wireDrag(stage, card, movie);
      const copy = card.querySelector(".card-copy");
      copy.addEventListener("click", (event) => {
        event.stopPropagation();
        openMovie(movie.id);
      });
      copy.addEventListener("keydown", (event) => {
        if (event.key === "Enter") openMovie(movie.id);
      });
      wireMetaLinks(card);
      card.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          handleCardAction(button.dataset.action, movie, card);
        });
      });
    }

    deck.appendChild(card);
  });
}

function renderMainPoster(movie) {
  const fallback = movie.poster || `https://i.ytimg.com/vi/${trailerIdsFor(movie)[0]}/hqdefault.jpg`;
  return `
    <div class="scene-frame">
      ${imageTag(movie.poster, movie.title, "media-image media-image-poster", fallback)}
    </div>
  `;
}

function renderCardMedia(movie, media, playTrailer = false) {
  const fallback = movie.poster || `https://i.ytimg.com/vi/${trailerIdsFor(movie)[0]}/hqdefault.jpg`;

  if (media.type === "trailer") {
    if (playTrailer) {
      return `
        <div class="trailer-frame playing">
          <iframe
            src="${trailerEmbedUrl(media.videoId)}"
            title="${movie.title} trailer"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen
          ></iframe>
        </div>
      `;
    }

    return `
      <div class="trailer-frame">
        ${imageTag(media.image, `${movie.title} trailer preview`, "media-image media-image-cover", fallback)}
        <button class="trailer-play" type="button" data-play-trailer aria-label="Play ${movie.title} trailer in app">
          <span>▶</span>
          Play Trailer
        </button>
      </div>
    `;
  }

  const caption = media.caption ? `<p class="scene-caption">${media.caption}</p>` : "";
  const fitClass = media.type === "poster" ? "media-image-poster" : "media-image-cover";

  return `
    <div class="scene-frame">
      ${imageTag(media.image, `${movie.title} ${media.label}`, `media-image ${fitClass}`, fallback)}
      ${caption}
    </div>
  `;
}

async function handleCardAction(action, movie, card) {
  if (action === "rewind") {
    await undoLastSwipe();
    return;
  }
  if (["like", "pass", "super"].includes(action)) {
    animateDecision(action, card);
  }
}

async function undoLastSwipe() {
  const lastId = session.undoStack?.at(-1);
  if (!lastId || !session.roomCode) {
    showMatchToast({ title: "Nothing to rewind" }, "");
    return;
  }
  try {
    await api(`/api/rooms/${session.roomCode}`, {
      method: "POST",
      body: JSON.stringify({
        action: "undo",
        participantId: session.participantId,
        movieId: lastId
      })
    });
    session.undoStack.pop();
    saveSession();
    await hydrateRoomDetails();
    render();
    showMatchToast({ title: "Undid last swipe" }, "");
  } catch (error) {
    showMatchToast({ title: error.message }, "Error");
  }
}

function updateDragGlow(card, deltaX, deltaY) {
  card.classList.remove("preview-like", "preview-pass", "preview-super");
  if (deltaY < -70 && Math.abs(deltaY) > Math.abs(deltaX)) {
    card.classList.add("preview-super");
  } else if (deltaX > 55) {
    card.classList.add("preview-like");
  } else if (deltaX < -55) {
    card.classList.add("preview-pass");
  }
}

function animateDecision(vote, card = deck.querySelector(".movie-card:last-child")) {
  if (!card) {
    swipe(vote);
    return;
  }

  card.classList.remove("preview-like", "preview-pass", "preview-super");
  card.classList.add(`decision-${vote}`);
  const exitX = vote === "like" ? 520 : vote === "pass" ? -520 : 0;
  const exitY = vote === "super" ? -620 : 0;
  const exitRotation = vote === "like" ? 24 : vote === "pass" ? -24 : 0;
  card.style.transform = `translate(${exitX}px, ${exitY}px) rotate(${exitRotation}deg)`;
  card.style.opacity = "0";
  window.setTimeout(() => swipe(vote), 180);
}

function renderMatches() {
  const matches = matchedMovies();
  matchesList.innerHTML = matches.length
    ? ""
    : `<p class="empty-state">No shared likes yet. Both players need to like or super-like the same movie.</p>`;

  matches.forEach((movie) => {
    const card = document.createElement("article");
    card.className = "match-card";
    card.tabIndex = 0;
    card.innerHTML = `
      <img src="${movie.poster}" alt="${movie.title} poster" />
      <div class="match-copy">
        <h3>${movie.title}</h3>
        <div class="movie-meta">${renderMovieMeta(movie)}</div>
      </div>
    `;
    wireMetaLinks(card);
    card.addEventListener("click", () => openMovie(movie.id));
    matchesList.appendChild(card);
  });
}

function renderLists() {
  renderCompactList(likedList, "like");
  renderCompactList(passedList, "pass");
}

function renderCompactList(container, vote) {
  const swipes = mySwipes();
  const picks = deckMovies().filter((movie) => {
    const userVote = swipes[movie.id];
    return vote === "like" ? isPositiveSwipe(userVote) : userVote === vote;
  });

  container.innerHTML = picks.length
    ? ""
    : `<p class="empty-state">Nothing here yet.</p>`;

  picks.forEach((movie) => {
    const item = document.createElement("button");
    item.className = "compact-movie";
    item.type = "button";
    item.innerHTML = `
      <img src="${movie.poster}" alt="" />
      <span>
        <strong>${movie.title}</strong><br />
        <span class="tagline">${swipes[movie.id] === "super" ? "Super liked · " : ""}${formatImdbRatingText(movie)} · 🍅 ${formatTomato(movie)} · ${movie.genres[0]} · ${movie.year}</span>
      </span>
    `;
    item.addEventListener("click", () => openMovie(movie.id));
    container.appendChild(item);
  });
}

async function swipe(vote) {
  const movie = currentMovie();
  if (!movie) return;

  try {
    const payload = await postSwipe(movie.id, vote);
    session.undoStack = session.undoStack || [];
    session.undoStack.push(movie.id);
    saveSession();
    if (payload.matched) {
      showMatchToast(movie, "Matched on");
    } else if (vote === "super") {
      showMatchToast(movie, "Super liked");
    }
    render();
  } catch (error) {
    showMatchToast({ title: error.message }, "Error");
  }
}

function showMatchToast(movie, label = "Matched on") {
  matchToast.textContent = `${label} ${movie.title}`;
  matchToast.classList.add("visible");
  window.setTimeout(() => matchToast.classList.remove("visible"), 1800);
}

function renderModalTrailer(movie) {
  const thumb = trailerThumb(movie);
  return `
    <div class="modal-trailer">
      <img src="${thumb}" alt="${movie.title} trailer preview" />
      <button class="modal-trailer-play" type="button" data-modal-play aria-label="Play ${movie.title} trailer">
        <span>▶</span>
        Play Trailer
      </button>
    </div>
  `;
}

function openMovie(movieId) {
  const movie = movies.find((candidate) => candidate.id === movieId);
  if (!movie) return;

  modalContent.innerHTML = `
    <img src="${movie.poster}" alt="${movie.title}" />
    <section>
      <p class="eyebrow">${movie.genres.join(" / ")} · ${movie.year} · ${movie.runtime}</p>
      <h2>${movie.title}</h2>
      <div class="movie-meta modal-movie-meta">${renderMovieMeta(movie)}</div>
      <a class="external-link" href="${justWatchUrl(movie)}" target="_blank" rel="noreferrer">View on JustWatch</a>
      <div class="detail-block">
        <h3>Overview</h3>
        <p class="overview">${movie.overview}</p>
      </div>
      <div class="detail-block cast-block">
        <h3>Main cast</h3>
        <p class="cast-row">${renderCastRow(movie.cast)}</p>
      </div>
      <div class="detail-block trailer-block">
        <h3>Trailer</h3>
        ${renderModalTrailer(movie)}
      </div>
    </section>
  `;

  modalContent.querySelector("[data-modal-play]")?.addEventListener("click", () => playModalTrailer(movie));

  modal.showModal();
}

function wireDrag(stage, card, movie) {
  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".trailer-play, .media-zone, .trailer-frame.playing iframe")) return;
    card.dataset.dragged = "false";
    drag = {
      card,
      movie,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0
    };
    stage.setPointerCapture(event.pointerId);
  });

  stage.addEventListener("pointermove", (event) => {
    if (!drag || drag.card !== card) return;
    drag.deltaX = event.clientX - drag.startX;
    drag.deltaY = event.clientY - drag.startY;
    if (Math.hypot(drag.deltaX, drag.deltaY) > 8) {
      card.dataset.dragged = "true";
    }
    const rotation = drag.deltaX / 18;
    card.style.transform = `translate(${drag.deltaX}px, ${drag.deltaY}px) rotate(${rotation}deg)`;
    updateDragGlow(card, drag.deltaX, drag.deltaY);
  });

  stage.addEventListener("pointerup", (event) => {
    if (!drag || drag.card !== card) return;
    card.classList.remove("preview-like", "preview-pass", "preview-super");

    const decision =
      drag.deltaY < -120 && Math.abs(drag.deltaY) > Math.abs(drag.deltaX)
        ? "super"
        : drag.deltaX > 110
          ? "like"
          : drag.deltaX < -110
            ? "pass"
            : null;

    if (decision) {
      card.classList.add(`decision-${decision}`);
      const exitX = decision === "like" ? 520 : decision === "pass" ? -520 : drag.deltaX;
      const exitY = decision === "super" ? -620 : drag.deltaY;
      const exitRotation = decision === "like" ? 24 : decision === "pass" ? -24 : 0;
      card.style.transform = `translate(${exitX}px, ${exitY}px) rotate(${exitRotation}deg)`;
      card.style.opacity = "0";
      window.setTimeout(() => swipe(decision), 160);
    } else {
      card.style.transform = "";
      window.setTimeout(() => {
        card.dataset.dragged = "false";
      }, 0);
    }
    drag = null;
  });
}

function promptName(defaultValue = "") {
  return new Promise((resolve) => {
    const input = document.querySelector("#host-name");
    input.value = defaultValue || session.participantName || "";
    nameModal.showModal();
    document.querySelector("#name-form").onsubmit = (event) => {
      event.preventDefault();
      const name = input.value.trim() || "Guest";
      nameModal.close();
      resolve(name);
    };
  });
}

async function bootstrap() {
  await loadMovies();

  const urlRoom = readRoomFromUrl();
  if (urlRoom && !session.roomCode) {
    setPinDigits(urlRoom.padStart(4, "0").slice(-4).split(""));
    showScreen("join");
  } else if (session.roomCode) {
    try {
      await hydrateRoomDetails();
      startPolling();
      showScreen(session.screen === "home" ? "lobby" : session.screen);
      if (session.screen === "lobby") renderLobby();
      else render();
    } catch {
      leaveRoom();
    }
  } else {
    showScreen("home");
  }
}

document.querySelector("#start-room-button").addEventListener("click", async () => {
  try {
    const name = await promptName();
    await createRoom(name);
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#open-join-button").addEventListener("click", () => {
  setPinDigits(readRoomFromUrl()?.split("") || ["", "", "", ""]);
  showScreen("join");
  openPinPad();
});

document.querySelector("#join-back-button").addEventListener("click", () => {
  pinPadModal.close();
  showScreen("home");
});

pinSlotsButton?.addEventListener("click", () => openPinPad());

document.querySelector("#pin-pad")?.addEventListener("click", (event) => {
  const key = event.target.closest("button")?.dataset.key;
  if (!key) return;

  if (key === "clear") {
    setPinDigits(["", "", "", ""]);
    return;
  }

  if (key === "back") {
    const next = [...pinDigits];
    let index = -1;
    for (let i = next.length - 1; i >= 0; i -= 1) {
      if (next[i]) {
        index = i;
        break;
      }
    }
    if (index >= 0) next[index] = "";
    setPinDigits(next);
    return;
  }

  const next = [...pinDigits];
  const openIndex = next.findIndex((digit) => !digit);
  if (openIndex === -1) return;
  next[openIndex] = key;
  setPinDigits(next);
  if (pinValue().length === 4) {
    pinPadModal.close();
  }
});

document.querySelector("#pin-pad-close")?.addEventListener("click", () => pinPadModal.close());

document.querySelector("#join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = pinValue();
  const name = document.querySelector("#join-name").value.trim() || "Guest";
  const errorEl = document.querySelector("#join-error");
  errorEl.textContent = "";
  if (pin.length !== 4) {
    errorEl.textContent = "Enter the 4-digit room PIN.";
    return;
  }
  try {
    await joinRoom(pin, name);
  } catch (error) {
    errorEl.textContent = error.message;
  }
});

document.querySelector("#copy-link-button").addEventListener("click", async () => {
  const link = document.querySelector("#share-link").value;
  try {
    await navigator.clipboard.writeText(link);
    showMatchToast({ title: "Link copied" }, "");
  } catch {
    document.querySelector("#share-link").select();
  }
});

document.querySelector("#copy-pin-button")?.addEventListener("click", async () => {
  if (!session.roomCode) return;
  try {
    await navigator.clipboard.writeText(session.roomCode);
    showMatchToast({ title: "PIN copied" }, "");
  } catch {
    showMatchToast({ title: session.roomCode }, "PIN");
  }
});

document.querySelector("#enter-swipe-button").addEventListener("click", async () => {
  if (!movies.length) await loadMovies();
  if (!roomState && session.roomCode) await hydrateRoomDetails();
  showScreen("swipe");
  render();
});

document.querySelector("#lobby-menu-button").addEventListener("click", () => {
  showScreen("lobby");
  renderLobby();
});

document.querySelector("#leave-room-button").addEventListener("click", leaveRoom);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    showScreen(button.dataset.screen);
    render();
  });
});

document.querySelector("#reset-swipes-button").addEventListener("click", async () => {
  try {
    await resetMySwipes();
  } catch (error) {
    alert(error.message);
  }
});

document.querySelector("#modal-close").addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});
modal.addEventListener("close", () => {
  stopTrailerPlayback();
});

bootstrap();
