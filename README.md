# ShotHub — Animation Pipeline Tracker

Two-folder monorepo:

```
animation project -2/
├── backend/      Node.js + Express + Prisma + PostgreSQL  (REST API + SSE)
├── frontend/     React + Vite + TypeScript + Tailwind     (SPA)
└── README.md
```

The folders are independent — each has its own `package.json`, `node_modules`, and build pipeline. Deploy them separately (e.g. backend on Render/Railway/Fly, frontend on Vercel/Netlify).

---

## First-time setup

### 1. PostgreSQL

You need a running PostgreSQL 14+ database. Local install on macOS:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb shothub
```

Or use a managed service — Supabase, Neon, Render, or Railway all give you a free Postgres URL.

### 2. Backend

```bash
cd backend
cp .env.example .env          # then edit .env with your DATABASE_URL and JWT_SECRET
npm install
npm run prisma:migrate        # create tables  (first run: --name init)
npm run db:seed               # insert 1 admin + 25 artists
npm run dev                   # → http://localhost:4000
```

Verify with: `curl http://localhost:4000/health`

### 3. Frontend

```bash
cd frontend
npm install
echo "VITE_API_URL=http://localhost:4000" > .env.local
npm run dev                   # → http://localhost:5173
```

Sign in with the seeded defaults:

| Role     | Email                  | Password   |
| -------- | ---------------------- | ---------- |
| Admin    | admin@studio.local     | admin123   |
| Artists  | <first>@studio.local   | studio123  |

> ⚠ Change passwords from **Team → ✏ Edit** before letting real users in.

---

## API surface

All endpoints are under `/api`. Authenticated routes need an `Authorization: Bearer <jwt>` header.

| Method | Path                        | Auth          | Notes |
| ------ | --------------------------- | ------------- | ----- |
| POST   | `/api/auth/login`           | —             | `{ email, password }` → `{ token, user }` |
| GET    | `/api/auth/me`              | any           | Returns current user |
| POST   | `/api/auth/change-password` | any           | Self password change |
| GET    | `/api/employees`            | any           | List |
| POST   | `/api/employees`            | MANAGER       | Create |
| PATCH  | `/api/employees/:id`        | MANAGER, self | Update |
| DELETE | `/api/employees/:id`        | MANAGER       | Soft-delete |
| GET    | `/api/clients`              | any           | |
| POST   | `/api/clients`              | MANAGER, LEAD | |
| PATCH  | `/api/clients/:id`          | MANAGER, LEAD | |
| DELETE | `/api/clients/:id`          | MANAGER       | |
| GET    | `/api/projects?clientId=`   | any           | |
| POST   | `/api/projects`             | MANAGER, LEAD | |
| PATCH  | `/api/projects/:id`         | MANAGER, LEAD | |
| DELETE | `/api/projects/:id`         | MANAGER       | |
| GET    | `/api/tasks?...`            | any           | Filters: `projectId`, `subStageId`, `assignedArtistId` |
| POST   | `/api/tasks`                | MANAGER, LEAD | |
| PATCH  | `/api/tasks/:id`            | any (gated)   | Artists can only move their own tasks through the allowed flow |
| DELETE | `/api/tasks/:id`            | MANAGER, LEAD | |
| POST   | `/api/tasks/:id/comments`   | any           | Submit review/retake note |
| GET    | `/api/events?token=<jwt>`   | any           | **SSE** stream of `task.created \| task.updated \| task.deleted` |

The SSE stream is what makes admin changes appear instantly on every employee's browser — no polling needed.

---

## Deployment

Backend and frontend are independent:

**Backend (e.g. Render)**
- Build: `npm install && npm run prisma:generate && npm run build`
- Start: `npm run prisma:deploy && npm start`
- Env: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`

**Frontend (e.g. Vercel)**
- Build: `npm install && npm run build`
- Output: `dist`
- Env: `VITE_API_URL=https://your-api.example.com`

---

## What's where

```
backend/
├── prisma/
│   ├── schema.prisma    Data model
│   └── seed.ts          Admin + 25-artist seed
├── src/
│   ├── index.ts         Server entry
│   ├── server.ts        Express app + routes wiring
│   ├── lib/
│   │   ├── prisma.ts    Prisma client (singleton)
│   │   ├── jwt.ts       Token sign/verify
│   │   └── sse.ts       Real-time event broadcaster
│   ├── middleware/
│   │   └── auth.ts      requireAuth + requireRole guards
│   └── routes/
│       ├── auth.ts      login, me, change-password
│       ├── employees.ts CRUD
│       ├── clients.ts   CRUD
│       ├── projects.ts  CRUD
│       ├── tasks.ts     CRUD + status transitions + comments
│       └── events.ts    SSE endpoint
├── .env.example
└── package.json

frontend/
├── src/                 React SPA (Phase 2: swap Dexie calls for fetch(API))
├── package.json
└── vite.config.ts
```
