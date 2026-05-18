# Animation Production Tracking Web Application

Full-stack animation production tracker for Hindi rhyme projects with role-based workflows, approvals, issue logging, deadline monitoring, reports, and real-time notifications.

## Tech Stack

- Frontend: React + Vite + TailwindCSS + React Router v6
- Backend: Node.js + Express.js
- Database: PostgreSQL + Prisma ORM
- Auth: JWT + bcrypt password hashing
- State: Zustand
- Realtime: Socket.io
- Charts: Recharts
- Dates: date-fns
- Icons: Lucide React

## Project Structure

```text
animation-tracker/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   └── index.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── store/
│   │   ├── utils/
│   │   └── main.jsx
│   └── package.json
└── README.md
```

## Prerequisites

1. Node.js 18+
2. npm 9+
3. PostgreSQL running locally or remotely

## Installation

### 1) Backend install

```bash
cd backend
npm install
cp .env.example .env
```

Update `.env` values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/animation_tracker?schema=public"
JWT_SECRET="replace-with-a-strong-secret"
PORT=4000
CLIENT_URL="http://localhost:5173"
```

### 2) Frontend install

```bash
cd ../frontend
npm install
cp .env.example .env
```

Update `.env` values:

```env
VITE_API_URL="http://localhost:4000/api"
VITE_SOCKET_URL="http://localhost:4000"
```

## Database Migration and Seed

From `backend/`:

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
```

## Start Development Servers

### Terminal 1 (Backend)

```bash
cd backend
npm run dev
```

Backend base URL: `http://localhost:4000`

### Terminal 2 (Frontend)

```bash
cd frontend
npm run dev
```

Frontend URL: `http://localhost:5173`

## Seed Login Credentials

All passwords: `password123`

- Boss: `boss@studio.com`
- Production Manager: `manager@studio.com`
- Coordinator: `coordinator@studio.com`
- Artist 1: `artist1@studio.com`
- Artist 2: `artist2@studio.com`
- Artist 3: `artist3@studio.com`
- Artist 4: `artist4@studio.com`
- Artist 5: `artist5@studio.com`

## Page Guide

- `/login`: Role-based login page
- `/dashboard`: Manager dashboard with KPIs, filters, project grid, status strip
- `/projects`: Manager project list
- `/projects/:id`: Project detail with stage table, approvals/rejections, issue/extension workflows, characters, activity timeline
- `/characters`: Character tracker and stage management
- `/approvals`: Approval queue for submitted stages
- `/employees`: Employee management, profile workload, stage assignment, deactivation
- `/reports`: Charts, deadlines table, issues breakdown, workload analytics
- `/my-tasks`: Employee view for assigned stages, submission flow, issue reporting, recent notifications

## Notes

- All non-login API routes require JWT auth.
- Manager-only routes are protected by role middleware.
- Project progress auto-recalculates from approved stages.
- Deadline warning/missed checks run on updates and daily cron.
- Notifications are saved in DB and pushed in real-time via Socket.io.
