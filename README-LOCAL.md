# ShotHub v3 — Local Server Setup

v3 runs as a **single process**: the Express backend serves both the REST API
and the built React app on one port. No Vercel, no separate frontend server,
no CORS. Uploaded videos are stored on the local disk.

## Windows quick start (recommended)

1. Install **Node.js 18+** and **PostgreSQL**, then create a database named `shothub`.
2. Copy `backend\.env.example` to `backend\.env` and fill in `DATABASE_URL` and `JWT_SECRET`.
3. Double-click **`setup.bat`** — installs everything, migrates, seeds and builds.
   Run it once now, and again any time you pull updates.
4. Double-click **`start.bat`**, then open <http://localhost:4000>.

> You do **not** run two servers. v3 is a single process: the API serves the
> built React app on one port. Vite is only used while `setup.bat` builds.

The detailed / macOS / Linux steps are below.

## Prerequisites

- **Node.js 18+** (`node -v`)
- **PostgreSQL 14+** running locally (or anywhere reachable)

## 1. Create the database

In `psql` (or pgAdmin):

```sql
CREATE DATABASE shothub;
```

## 2. Configure the backend

Copy the example env file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

- `DATABASE_URL` — point it at the database you just created, e.g.
  `postgresql://postgres:postgres@localhost:5432/shothub`
- `JWT_SECRET` — a long random string. Generate one with:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `PORT` — the port to run on (default `4000`)
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — the first admin login that the
  seed creates
- `UPLOADS_DIR` *(optional)* — absolute path for stored videos. Defaults to
  `backend/uploads`. Put it on a drive with room for video files.

## 3. Install, migrate, seed and build — one command

From the project root:

```bash
npm run setup
```

This installs both projects, generates the Prisma client, applies migrations,
seeds the admin account, and builds the API + frontend.

## 4. Start

```bash
npm start
```

Open **http://localhost:4000** (or whatever `PORT` you set) and log in with the
seed admin credentials.

## Updating later

After pulling new code:

```bash
npm run setup   # re-installs, migrates, re-seeds (idempotent), rebuilds
npm start
```

To rebuild only after a code change without re-migrating:

```bash
npm run build && npm start
```

## Notes

- **Backups** — your data lives in PostgreSQL. Back it up with `pg_dump shothub`.
- **Uploaded videos** live in `UPLOADS_DIR` (default `backend/uploads`). Back up
  that folder too.
- To run the API only (frontend hosted elsewhere) set `SERVE_FRONTEND=false`
  in `backend/.env`.
