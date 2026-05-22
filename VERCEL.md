# Movie Buddy — full Vercel deployment guide

This guide walks you from **zero** to a live URL your friends can use. Movie Buddy needs **Vercel KV** so rooms and 4-digit PINs work across phones and browsers.

---

## What you are deploying

| Piece | Role |
|-------|------|
| `index.html`, `app.js`, `styles.css` | The app UI (static files) |
| `movies.json`, `movies-extra.json` | 30 movies |
| `api/*.js` | Serverless API (create/join rooms, swipes) |
| `lib/room-store.js` | Saves rooms in **Vercel KV** (required online) |

**Without KV:** rooms vanish between requests and friends cannot join with your PIN.

---

## Before you start (checklist)

- [ ] A [GitHub](https://github.com) account (free)
- [ ] A [Vercel](https://vercel.com) account (free; sign in with GitHub is easiest)
- [ ] **Git** installed — [git-scm.com/download/win](https://git-scm.com/download/win)
- [ ] This project folder: `Documents\download new things`

You do **not** need the AI Gateway key (`vck_…`) for Movie Buddy. Do **not** put API keys in your code or commit them to GitHub.

---

## Part 1 — Put the project on GitHub

Vercel deploys easiest from GitHub. Your repo currently has **no commits**; do this once.

### 1.1 Open terminal in the project folder

**Option A:** In Cursor, terminal → `cd` to the project:

```powershell
cd "C:\Users\aurora\Documents\download new things"
```

**Option B:** File Explorer → open the folder → type `cmd` in the address bar → Enter.

### 1.2 Create the first commit

```powershell
git add .
git commit -m "Movie Buddy: Vercel-ready app with shared rooms"
```

If Git asks for your name/email the first time, follow its instructions, then run `git commit` again.

### 1.3 Create a new repository on GitHub

1. Go to [github.com/new](https://github.com/new)
2. **Repository name:** e.g. `movie-buddy` (any name is fine)
3. Leave it **Public** or **Private** (your choice)
4. **Do not** add README, .gitignore, or license (you already have files)
5. Click **Create repository**

### 1.4 Push your code

GitHub shows commands like these — use yours if the URL differs:

```powershell
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/movie-buddy.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `movie-buddy` with your real GitHub user and repo name.

Sign in to GitHub if the browser or credential manager prompts you.

**Done when:** On GitHub you see all project files (`api/`, `app.js`, `vercel.json`, etc.).

---

## Part 2 — Import the project on Vercel

### 2.1 New project

1. Open [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **Add New…** → **Project**
3. Under **Import Git Repository**, find your `movie-buddy` repo
4. If you do not see it: **Adjust GitHub App Permissions** and allow access to that repo

### 2.2 Configure the project

On the import screen:

| Setting | Value |
|---------|--------|
| **Framework Preset** | Other (or leave default) |
| **Root Directory** | `./` (project root) |
| **Build Command** | leave empty (static + serverless functions only) |
| **Output Directory** | leave empty |

Click **Deploy**.

### 2.3 First deploy result

- Vercel builds and gives you a URL like `https://movie-buddy-xxxxx.vercel.app`
- The site may **load**, but **rooms will not work reliably yet** until KV is linked (Part 3)

Open the URL and check:

- Home screen shows **Movie Buddy**
- `https://YOUR-URL.vercel.app/api/health` should return JSON like `{"ok":true,"kv":false}`

If `kv` is `false`, you still need KV.

---

## Part 3 — Add Vercel KV (required)

### 3.1 Create KV

1. Vercel dashboard → your **Movie Buddy** project
2. Top tabs → **Storage** (or **Integrations** → Storage)
3. **Create Database** → choose **KV** (Redis)
4. Name it e.g. `movie-buddy-kv` → **Create**
5. When asked **Connect to project**, select your Movie Buddy project → **Connect**

Vercel automatically adds:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

to the project environment.

### 3.2 Redeploy so env vars apply

1. Project → **Deployments**
2. Latest deployment → **⋯** menu → **Redeploy**
3. Confirm **Redeploy**

### 3.3 Verify KV is active

Visit:

```text
https://YOUR-URL.vercel.app/api/health
```

You want:

```json
{"ok":true,"omdb":false,"kv":true}
```

`"kv":true` means shared rooms will persist.

---

## Part 4 — Optional: live IMDb ratings

1. Get a free key at [omdbapi.com/apikey.aspx](https://www.omdbapi.com/apikey.aspx)
2. Vercel project → **Settings** → **Environment Variables**
3. Add:

| Name | Value | Environments |
|------|--------|----------------|
| `OMDB_API_KEY` | your key | Production, Preview, Development |

4. **Save** → **Deployments** → **Redeploy** latest

Ratings still work without this (data comes from `movies.json`).

---

## Part 5 — Test with a friend

Use **two devices** (or one phone + one computer browser), both on the **same Vercel URL**.

### Host (you)

1. Open your Vercel URL
2. **Start New Game** → enter your name
3. You land on **MENU** with a **4-digit PIN** (e.g. `4829`)
4. Tap **Copy PIN** or **Copy** on the share link
5. Wait on MENU — status should say waiting for a friend

### Friend

1. Open the **same** Vercel URL (or your link with `?room=4829`)
2. **Join Game**
3. Tap the **four PIN boxes** → **number pad** opens
4. Enter your 4-digit PIN → name → **Join room**
5. Friend should appear on MENU on **both** screens within ~1 second

### Start playing

- When **2+ players** show on MENU, **Start swiping** unlocks
- Both swipe the **same 30 movies** for that room
- **Matches** tab shows movies you both liked or super-liked

---

## Part 6 — Custom domain (optional)

1. Project → **Settings** → **Domains**
2. Add your domain and follow DNS instructions from Vercel

---

## Deploy again after you change code

Whenever you edit files locally:

```powershell
cd "C:\Users\aurora\Documents\download new things"
git add .
git commit -m "Describe your change"
git push
```

Vercel auto-deploys on every push to `main` (usually 1–2 minutes).

---

## Alternative — deploy with Vercel CLI (no GitHub)

Only if you prefer not to use GitHub:

1. Install Node.js: [nodejs.org](https://nodejs.org) (includes `npm`)
2. In the project folder:

```powershell
cd "C:\Users\aurora\Documents\download new things"
npm install
npx vercel login
npx vercel
```

Follow prompts (link to your Vercel account, confirm project name).

Production deploy:

```powershell
npx vercel --prod
```

Still add **KV** in the dashboard and link it to this project, then redeploy.

---

## Troubleshooting

### Friend gets “Room not found”

| Cause | Fix |
|--------|-----|
| KV not connected | Part 3 — `api/health` must show `"kv":true` |
| Wrong PIN | PIN is exactly **4 digits**; no letters |
| Old deploy | Host must **Start New Game** after KV was enabled |
| Different URL | Friend must use the **same** `*.vercel.app` URL as host |

### PIN works locally but not on Vercel

Local `start-movie-matcher.cmd` uses **memory** only. Only the **Vercel URL** shares rooms with friends.

### `npm` not recognized on Windows

Install Node.js from [nodejs.org](https://nodejs.org), restart terminal, or use **GitHub + Vercel dashboard** (Part 1–2) and skip CLI.

### Build failed on Vercel

1. **Deployments** → failed deployment → **Building** logs
2. Common fixes: ensure `package.json` is in the repo root; push all files including `api/` and `lib/`

### Rooms reset after a few days

KV rooms expire after **7 days** (by design). Start a new game for a new PIN.

---

## Quick reference

| Task | Where |
|------|--------|
| Live site URL | Vercel → Project → **Domains** or latest **Deployment** |
| Room database | Vercel → **Storage** → KV |
| Secrets | **Settings** → **Environment Variables** |
| Logs / errors | **Deployments** → a deployment → **Functions** / **Runtime Logs** |
| Local test only | Double-click `start-movie-matcher.cmd` → `http://127.0.0.1:4173` |

---

## Security reminder

- Never commit `.env`, `api-keys.env`, or keys that start with `vck_`
- If a key was pasted in chat or code, **revoke it** in Vercel/Cursor and create a new one
- `.gitignore` already excludes `.env` and `.vercel/`

When `api/health` shows `"kv":true` and two devices can join the same PIN on MENU, your deployment is complete.
