# Top Token: deployment

How to deploy the backend and the storefront to Render, written so the first
real deployment is a checklist rather than an improvisation.

**Nothing is deployed yet.** No Render service exists, no managed database is
provisioned, and no production credential has been created. This describes what
to do, and what the application already refuses to do without.

## What the backend needs from its host

| Requirement | Status |
|---|---|
| Reads `PORT` from the environment | yes |
| Binds `0.0.0.0`, not localhost | yes |
| Stateless HTTP process | yes, no durable state on disk |
| Graceful shutdown on SIGTERM | yes, `enableShutdownHooks` |
| Health endpoint | `GET /api/v1/health` |
| Readiness endpoint | `GET /api/v1/ready`, runs a real query |
| Safe with several instances | yes, see below |
| Fails fast on bad configuration | yes, before dependency injection |

Nothing durable is written to the filesystem. Sessions, carts, idempotency keys
and rate-limit counters all live in PostgreSQL, so an instance can be replaced
at any moment without losing customer state.

## Running more than one instance

The housekeeping sweep runs on every instance. That is intentional and safe:
each step is a conditional `UPDATE` that claims rows atomically, so instances
divide the work rather than repeating it. There is no leader to elect and no
lock to acquire.

Rate limiting and idempotency are also in the database rather than in memory, so
two instances share one budget and one decision. A restart hands nobody a fresh
allowance.

## Environment variables

Set through the Render dashboard, never in a file. The application validates
every one at startup and refuses to boot if any is missing or unsafe, which is
the behaviour you want: a service that starts with a broken configuration is
worse than one that does not start.

| Variable | Required when deployed | Notes |
|---|---|---|
| `NODE_ENV` | yes | `staging` or `production`, both hardened identically |
| `DATABASE_URL` | yes | Render's internal connection string |
| `SESSION_SECRET` | yes | 32+ characters, generated, never reused |
| `PAYMENT_WEBHOOK_SECRET` | yes | 32+ characters, different from `SESSION_SECRET` |
| `NOTIFICATION_TRANSPORT` | yes | `log` is refused; no mail provider exists yet, so `none` until one does |
| `ADMIN_TOKENS` | yes | `name:token` pairs, one per operator, never shared. Without it nobody can deliver an order |
| `CORS_ALLOWED_ORIGINS` | yes | the storefront origin; a wildcard is refused |
| `COOKIE_SECURE` | yes | must be `true` |
| `COOKIE_SAME_SITE` | no | `lax` unless the storefront is on another site |
| `PORT` | no | Render sets it |
| `HOUSEKEEPING_INTERVAL_SECONDS` | no | defaults to 60 |
| `PAYMENT_MODE` | no | `sandbox` only; `production` is refused |
| `OTP_DEV_ECHO` | no | must be absent or `false`; refused when deployed |

Generate a secret with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Steps

1. **Provision PostgreSQL** on Render. Note the internal connection string.
   Confirm the database is UTF-8; the catalog is Hebrew and a WIN1252 cluster
   rejects it outright.
2. **Create the backend web service** from this repository, root directory
   `backend`.
   - Build: `npm ci && npx prisma generate && npm run build`
   - Start: `npx prisma migrate deploy && node dist/main.js`
   - Health check path: `/api/v1/ready`
3. **Set the environment variables** above.
4. **Seed the catalog** once, from a one-off job: `npm run seed`. The seed is
   idempotent and marks everything as development data, so review it before
   using it as a real catalog.
5. **Deploy the storefront** as a static site.
   - Build: `npm ci && npx ng build --configuration staging`
   - Publish directory: `dist/top-token`
   - Repoint `apiBaseUrl` in `src/environments/environment.staging.ts` at the
     deployed backend first. It currently points at `http://localhost:3000/api`,
     because that is where the only backend runs today.
6. **Add the storefront origin** to `CORS_ALLOWED_ORIGINS` and redeploy the
   backend.
7. **Verify** before announcing anything:
   - `GET /api/v1/ready` returns 200 and names the database check.
   - `GET /api/v1/products` returns the catalog.
   - The storefront lists products, and the browser's network tab shows calls to
     the deployed API.
   - A checkout can be opened and its session survives a page reload.

## Migrations

`prisma migrate deploy` applies pending migrations and never generates new ones.
It is safe to run on every deploy: applied migrations are recorded and skipped.
Do not run `migrate dev` against a deployed database; it can reset the schema.

The full suite has been run against a database created from empty, applying
every migration and seeding from scratch, so a first deployment is a path that
has been exercised.

## What is deliberately not ready

- **Production payments.** `PAYMENT_MODE=production` is refused at startup. Only
  the sandbox provider exists, no merchant account has been opened, and no
  provider credential exists.
- **Email.** No mail provider is configured. `NOTIFICATION_TRANSPORT=log` is
  refused once deployed precisely so a deployment cannot silently drop every
  customer notification.
- **Fulfillment.** Orders reach `FULFILLMENT_PENDING` and stop. Delivery is
  manual, and nothing invents a code.
- **The production storefront build.** It still runs in mock mode and says so.
  Switching it is one line, and it should not be switched until the backend is
  deployed and verified.
- **CI.** No pipeline runs the suite automatically. It is run by hand.
- **`embedded-postgres`.** Development and test only. It must never appear in a
  deployed environment, which is why `DATABASE_URL` is required there.

## Google sign-in

The implementation is complete and inert until an OAuth client exists. Creating
one is an owner task and is documented step by step, including the exact
redirect URI to paste into Google Cloud, in
[GOOGLE-OAUTH.md](GOOGLE-OAUTH.md).

Summary of what the backend service needs:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://top-tokenil.onrender.com/api/v1/auth/google/callback
APP_BASE_URL=https://top-tokenil.onrender.com
```

The client secret belongs to the backend only. It must never appear in an
Angular `environment.*.ts` file, because those ship to the browser.
