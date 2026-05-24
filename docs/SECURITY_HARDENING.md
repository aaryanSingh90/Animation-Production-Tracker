# ShotHub Security Hardening — v2 Phase 1

Code-level hardening for ShotHub before the 1–2 week client cloud trial,
and again before the on-prem handover. The code changes are already in
the v2 branch; this doc covers the dashboard / operational steps you have
to do by hand.

---

## Phase 1 — Before the client starts the trial (this week)

### ☐ 1. Rotate `JWT_SECRET` on Render to a 64-char random value

```bash
openssl rand -base64 64
```

1. Copy the output.
2. Render dashboard → your backend service → **Environment** tab.
3. Find `JWT_SECRET` → click ✏️ → paste the new value → Save.
4. Render redeploys the service automatically. Every existing logged-in user
   will be kicked to /login (expected).

> **Why**: if the old secret was a placeholder or short, it could be brute-forced
> or already known by someone. Rotating invalidates every issued token.

### ☐ 2. Verify `CORS_ORIGIN` is your Vercel URL only

1. Render dashboard → backend → Environment → `CORS_ORIGIN`.
2. Should be exactly your production frontend URL (e.g.
   `https://animation-production-tracker.vercel.app`). No `*`, no localhost.
3. Save (no rebuild needed for env-only changes).

### ☐ 3. Enable Render Postgres automated backups

1. Render dashboard → your Postgres instance → **Backups** tab.
2. Toggle **Automated backups: enabled**.
3. Confirm retention (7 days on free tier — fine for a 2-week trial).
4. Take a manual backup right now too: click **Create backup** → label
   it `pre-trial-baseline`.

### ☐ 4. Enable Dependabot security updates on the GitHub repo

1. GitHub → repo → **Settings** → **Code security**.
2. Toggle on:
   - **Dependabot alerts**
   - **Dependabot security updates**
   - **Dependabot version updates** (creates `.github/dependabot.yml` if needed)
3. Confirm there are no critical CVEs already open. If yes, merge the
   first PRs Dependabot creates.

### ☐ 5. (Optional) Set up Sentry for error monitoring

The code already supports Sentry — when you set the DSN it activates.

**Backend:**
1. sentry.io → create new project → Node.js → name it `shothub-api`.
2. Copy the DSN (looks like `https://abc...@o123.ingest.sentry.io/456`).
3. Render dashboard → backend → Environment → add `SENTRY_DSN` → paste → Save.

**Frontend:**
1. sentry.io → create new project → React → name it `shothub-web`.
2. Copy the DSN.
3. Vercel dashboard → project → Settings → Environment Variables.
4. Add `VITE_SENTRY_DSN` for the **Production** environment → paste → Save.
5. Redeploy: Vercel → Deployments → ⋯ → Redeploy latest.

### ☐ 6. Vercel: confirm the production branch is `v2`

1. Vercel project → Settings → Git.
2. Production branch: `v2`. (If it shows `main`, change to `v2` and save.)
3. Deployments → wait for the next push to redeploy on v2.

### ☐ 7. Force password reset for every test account before handing the URL over

Just before the client starts using it:

1. Log in as the studio admin.
2. Team page → for each test/seed user → edit → set a new temp password
   (any 10+ char random string).
3. The "managers can change passwords" flow sets `mustChangePassword = true`
   automatically — when the artist logs in next, they're forced to pick
   their own password before they can do anything else.

### ☐ 8. Test the lockout flow once

1. Open the login page in an incognito window.
2. Try the wrong password 5 times.
3. The 5th attempt should return `423 Locked` with the message
   "Too many failed attempts. Account locked for 60 more minutes."
4. Log in with the correct password from a different account — confirm
   it works. (Lockout is per-user, not per-IP.)
5. After 1 hour, the original account can log in again.

---

## Phase 2 — During the 2-week trial (operational)

Every day or two, glance at these:

- **Sentry** → any new errors? Triage and ship a fix.
- **Render logs** → any spikes of 401 / 429 / 500? Investigate.
- **Dependabot alerts** → merge security PRs as they arrive (auto-merge is fine
  for patch-level updates).
- **Postgres size** → if it's approaching the free-tier 1GB, upgrade or
  trim old `_prisma_migrations` rows.

Weekly:

- Run `npm audit` in both `backend/` and `frontend/`. Fix any high/critical.
- Test the manual restore: copy the latest Render backup to your laptop, restore
  to a local Postgres, hit the API. Confirms backups actually work.

---

## Phase 3 — Pre-handover (last 2 days of trial)

Before the studio takes ShotHub onto their own server:

### ☐ 1. Generate fresh secrets

Do NOT reuse the cloud's `JWT_SECRET`, `DATABASE_URL` password, etc. on the
client's server. If anything leaked during the cloud phase, the on-prem
deploy is clean.

```bash
# Generate three independent secrets:
openssl rand -base64 64    # → JWT_SECRET
openssl rand -base64 32    # → POSTGRES_PASSWORD
openssl rand -base64 32    # → COOKIE_SECRET (future use)
```

### ☐ 2. Bind Postgres to `127.0.0.1`

On their server, edit `/etc/postgresql/16/main/postgresql.conf`:

```conf
listen_addresses = 'localhost'
```

Restart: `sudo systemctl restart postgresql`. Now only the ShotHub API
(on the same machine) can talk to Postgres — nobody on the LAN can connect
to port 5432 directly.

### ☐ 3. Firewall: only 80, 443, 22 open

```bash
sudo ufw allow 80/tcp     # HTTP → redirects to HTTPS
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 22/tcp     # SSH for admin
sudo ufw default deny incoming
sudo ufw enable
```

### ☐ 4. HTTPS even on the LAN — via Caddy with `tls internal`

```caddyfile
# /etc/caddy/Caddyfile
shothub.local {
    tls internal
    encode gzip

    handle_path /api/* {
        reverse_proxy localhost:4000
    }

    handle {
        root * /opt/shothub/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

Reload: `sudo systemctl reload caddy`. Each artist's browser will warn
about the self-signed cert once; they click "advanced → proceed" and it's
trusted forever after.

### ☐ 5. Encrypted nightly backups to a 2nd machine

```bash
# Install age for symmetric encryption
brew install age            # or apt install age

# Generate a key (keep this somewhere SAFE — without it, backups are unreadable)
age-keygen -o ~/.shothub-backup-key.txt

# Crontab entry — nightly at 2am
0 2 * * * pg_dump -U shothub_app shothub_prod \
  | age -r $(grep "public key:" ~/.shothub-backup-key.txt | cut -d' ' -f4) \
  > /mnt/nas/shothub/$(date +\%Y-\%m-\%d).sql.age
```

Test the restore on the second machine before you hand the studio over.

### ☐ 6. Read-only DB user for backups

```sql
CREATE USER shothub_backup WITH PASSWORD 'another-strong-random-string';
GRANT CONNECT ON DATABASE shothub_prod TO shothub_backup;
GRANT USAGE   ON SCHEMA public TO shothub_backup;
GRANT SELECT  ON ALL TABLES IN SCHEMA public TO shothub_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO shothub_backup;
```

The cron job above uses `shothub_backup`, not the app user. If the cron host
is compromised, the attacker gets a read-only view — no DROP TABLE.

### ☐ 7. IT-person runbook (one page in their inbox)

A tiny doc the studio's IT person can read at 3am:

```
SHOTHUB — IF SOMETHING IS BROKEN
================================
URL:      https://shothub.local
Admin:    admin@studio.local
Server:   server-01 (192.168.1.50)
SSH:      ssh admin@192.168.1.50

LOGS:
  Backend:   docker compose logs -f api
  Postgres:  docker compose logs -f db
  Caddy:     sudo journalctl -u caddy -f

RESTART (zero data loss):
  cd /opt/shothub && docker compose restart

RESTORE A BACKUP (last resort — read first):
  age -d -i ~/.shothub-backup-key.txt <backup.sql.age> \
    | docker compose exec -T db psql -U shothub_app shothub_prod

EMERGENCY CONTACT:  aaryan — +91-xxxx-xxxxxx
```

Print it. Tape it to the server.

---

## What the code already does for you

These were shipped in the Phase-1 commits — no dashboard work needed:

| Code-level | Status |
|---|---|
| Bcrypt password hashing (10 rounds) | ✅ |
| JWT in HttpOnly + SameSite=Lax cookie (no localStorage) | ✅ new |
| Account lockout (5 fails / 1h → 1h lock) | ✅ new |
| Force password change on first login | ✅ new |
| Strong password policy (10+ chars, letter + digit, banned common patterns) | ✅ new |
| Short JWT TTL (1h) + auto-refresh every 50 min | ✅ new |
| Per-route rate limits (login, change-password, refresh, all writes) | ✅ new |
| Helmet security headers | ✅ |
| CORS allowlist via env | ✅ |
| Role-based access (Manager / Artist) enforced server-side | ✅ |
| Ownership checks on every multi-tenant route | ✅ |
| Zod validation on every server input | ✅ |
| Sentry integration ready (drop in DSN to enable) | ✅ new |
| `trust proxy` set so rate limiters key on real client IP | ✅ new |

---

## Quick reference — what each Phase-1 task protects against

| Threat | Protected by |
|---|---|
| Stolen JWT via XSS | HttpOnly cookie (Phase 1.2) |
| Password spraying across IPs | Account lockout (Phase 1.3) |
| Compromised tokens after password change | tokenVersion + strict middleware |
| 30-day-stale token still working | 1h JWT TTL + refresh (Phase 1.4) |
| Network sniffing on LAN | Caddy HTTPS (Phase 3.4) |
| DB password leak | Read-only backup user (Phase 3.6) |
| Brute-force on login | rate-limit (existing) + lockout (Phase 1.3) |
| Brute-force on password change | rate-limit on /change-password (Phase 1.5) |
| Internet attackers in general | HTTPS + helmet + CORS + Vercel/Cloudflare DDoS |
| Disgruntled employee | Role checks + audit log (`statusHistory`) |
| Stolen laptop | 1h session expiry (Phase 1.4) + cookie clears on logout |
| Public exposure of Postgres | `listen_addresses = 'localhost'` (Phase 3.2) |
| Unencrypted backup | age encryption (Phase 3.5) |
