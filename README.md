# Animation Production Tracker

Production-grade full-stack Animation Production Pipeline Management System for animation studios.

## Stack

- Frontend: React + Vite + TailwindCSS + React Router v6 + Axios + Zustand + Recharts + Socket.io Client
- Backend: Node.js + Express + Prisma + PostgreSQL + JWT + Socket.io + node-cron
- Deployment: Frontend on Vercel, Backend on Render Web Service, Database on Render PostgreSQL

## Monorepo Structure

```text
animation-tracker/
├── frontend/
├── backend/
└── README.md
```

Frontend and backend are deployable independently.

---

## 1. Local Development

### Prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL 14+

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Set local values in `backend/.env`.

Run migrations + seed:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

Start backend:

```bash
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Set frontend env:

```env
VITE_API_URL=https://your-backend-domain.onrender.com/api
```

Start frontend:

```bash
npm run dev
```

---

## 2. Production Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL=postgresql://<db-user>:<db-password>@<render-db-host>/<db-name>
JWT_SECRET=<strong-random-secret>
CLIENT_URL=https://animation-production-tracker.vercel.app
NODE_ENV=production
PORT=10000
```

### Frontend (`frontend/.env`)

```env
VITE_API_URL=https://animation-production-tracker.onrender.com/api
```

Notes:
- Do not commit `.env` files.
- Set the same variables in Render/Vercel dashboard.

---

## 3. Backend Production Readiness

Implemented:

- `require("dotenv").config()` loaded first in server bootstrap.
- CORS uses `CLIENT_URL` only.
- Socket.io CORS is production-safe (`origin`, `methods: ["GET", "POST"]`, credentials).
- Helmet secure headers.
- API + auth rate limiting.
- Input sanitization middleware.
- Zod request validation on critical routes.
- JWT auth middleware + role-based middleware.
- Centralized error middleware:
  - Validation errors
  - JWT errors
  - Prisma/database errors
  - Production-safe responses (no stack trace leak)
- Structured request + error logging.
- Health route: `GET /api/health` returns `{ "status": "ok" }`.
- Prisma singleton-safe client.
- Graceful shutdown for SIGINT/SIGTERM:
  - stop cron task
  - close Socket.io + HTTP server
  - disconnect Prisma
- Render-compatible port binding:
  - `const PORT = Number(process.env.PORT || 5000)`

---

## 4. Frontend Production Readiness

Implemented:

- Environment-driven API base URL only (`VITE_API_URL`).
- Reusable Axios instance in `frontend/src/lib/api.js`:
  - JWT auto-attach
  - JSON headers
  - response/error interceptors
  - global unauthorized handling with auto logout
  - network failure message support
- React Router SPA rewrite support via `frontend/vercel.json`.
- Route lazy loading + code splitting with `React.lazy` + `Suspense` fallback.
- Global ErrorBoundary.
- Memoization for expensive shared UI components.
- Loading/skeleton states + empty states + toasts.
- Protected and role-based routes.
- Socket notifications use env-driven backend URL.
- Accessible modal dialog semantics + Escape/outside close.

---

## 5. Deployment Guide

### A) Deploy Database (Render PostgreSQL)

1. Create PostgreSQL instance on Render.
2. Copy internal/external `DATABASE_URL`.
3. Use that value in backend service env vars.

### B) Deploy Backend (Render Web Service)

Service settings:

- Root Directory: `backend`
- Build Command:

```bash
npm install && npx prisma generate && npx prisma migrate deploy
```

- Start Command:

```bash
node src/index.js
```

Environment variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `NODE_ENV=production`
- `PORT=10000` (Render injects `PORT`; keep fallback in code)

After first deploy (optional seed):

```bash
npx prisma db seed
```

### C) Deploy Frontend (Vercel)

Project settings:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`

Environment variable:

- `VITE_API_URL=https://animation-production-tracker.onrender.com/api`

`vercel.json` rewrite is already included for route refresh support.

---

## 6. Prisma Commands

From `backend/`:

```bash
npx prisma generate
npx prisma migrate dev --name init
npx prisma migrate deploy
npm run prisma:seed
```

---

## 7. Seed Credentials

Password for all seeded users: `password123`

- boss@studio.com
- manager@studio.com
- coordinator@studio.com
- artist1@studio.com
- artist2@studio.com
- artist3@studio.com
- artist4@studio.com
- artist5@studio.com

---

## 8. Security and Ops Notes

- Secrets are env-driven and not hardcoded in source.
- `.gitignore` excludes `.env`, `node_modules`, build artifacts, coverage.
- Use a strong JWT secret and rotate periodically.
- Consider enabling persistent distributed rate-limit store (Redis) at higher scale.
- Add centralized log shipping and APM for production observability.

---

## 9. Verification Checklist

- Frontend production build passes.
- Backend boot + `/api/health` pass.
- Prisma generate and migrations pass.
- JWT login/auth works.
- Role-based route protection works.
- CORS between Vercel and Render is configured.
- Socket.io notifications configured with production origin.
- Backend handles graceful shutdown cleanly.
