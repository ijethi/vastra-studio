# Vastra Studio

AI virtual try-on for boutiques. Upload a garment photo; get a photoreal image of a model wearing it, checked by a quality gate, ready for Instagram, WhatsApp and print.

The full requirements document (scope, architecture, security, cost model, roadmap, and what is still needed from the owner) lives in the shared doc: **AI Virtual Try-On for Boutiques — Requirements Document**.

## Quick start (no API keys needed)

```bash
pnpm install
cp .env.example .env.local        # set AUTH_SECRET to any 32+ character string
pnpm seed:base-models             # renders the development model library
pnpm dev
```

Open http://localhost:3000, sign in with any email. The one-time code is printed in the terminal (no email provider configured). Create a boutique, upload a garment photo (there is a sample at `public/samples/sample-kurta.jpg`), generate.

Node 20.11 or newer is required; Node 22 LTS is recommended.

In development everything runs in one process: an embedded Postgres (PGlite) in `./.data/pg`, local object storage in `./.data/storage`, an in-process job queue, and **mock** AI providers that composite the garment onto a placeholder model so the whole pipeline can be exercised offline.

## Switching on the real providers

| Env var | Effect |
| --- | --- |
| `TRYON_PROVIDERS=fashn,google` + `FASHN_API_KEY` | FASHN v1.6 as primary try-on, Google Virtual Try-On as fallback |
| `GOOGLE_CLOUD_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Enables the Google adapter |
| `VISION_PROVIDER=claude` + `ANTHROPIC_API_KEY` | Claude vision for garment analysis and the output quality gate |
| `PERSON_PROVIDER=gemini` + `GEMINI_API_KEY` | Gemini image generation draws the model around mannequin garments (exact-garment mode); `GEMINI_IMAGE_MODEL` picks the model |
| `SEGMENTER=auto\|imgly\|heuristic\|mock` | Garment cut-out: the bundled CPU background-removal model (default when it loads), a sharp colour heuristic, or a fixed mask for tests |
| `DATABASE_URL` | Managed Postgres instead of PGlite (migrations run at boot) |
| `REDIS_URL` | BullMQ queue; run `pnpm worker` as a separate process |
| `STORAGE_DRIVER=s3` + `S3_*` | Cloudflare R2 or S3 with presigned URLs |
| `RESEND_API_KEY` | Real email for sign-in codes and invitations |
| `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` | Credit pack purchases |
| `GOOGLE_CLIENT_ID/SECRET` | Google sign-in |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated emails that get `/admin` |

## Benchmarking the try-on providers

Before pricing is fixed, FASHN and Google need to be measured on real Indian garments (sarees, lehengas, kurta sets). `scripts/benchmark-providers.ts` runs every provider listed in `TRYON_PROVIDERS` on each garment photo × base model pair with a fixed seed, times each call, records the provider's reported cost, runs the vision quality gate on every output, and writes the images plus `results.json` and `results.md` (provider × garment: pass/fail, score, latency, cost) to `./.data/benchmark/<timestamp>/`. It imports the library code directly, reads keys from `.env.local`, never calls the app server and writes nothing to the database.

```bash
pnpm tsx scripts/benchmark-providers.ts public/samples bm-regular-wheatish-20s
```

Put the 50 benchmark photos in a folder and pass several base-model ids separated by commas (ids are in `src/lib/base-models/catalog.ts`). Works offline today with `TRYON_PROVIDERS=mock` and `VISION_PROVIDER=mock`; set `FASHN_API_KEY`, the `GOOGLE_*` credentials and `ANTHROPIC_API_KEY` in `.env.local` to benchmark the real providers and the Claude gate. Providers without keys are listed as skipped in the report. Useful flags: `--providers=fashn,google` (override the env order), `--vision=claude`, `--seed=42`, `--quality=balanced`, `--category=saree` (skip vision analysis for the category), `--limit=5`, `--timeout=120000`. The exit code is 1 if any provider call errored.

## Exact-garment mode for real shop photos

Boutiques photograph on a mannequin in the shop, with rails behind and warm bulbs overhead, and try-on models drift: colour shifts, embroidery gets simplified, a border moves. The pipeline now prepares every photo before any generation (`src/lib/jobs/exact-mode.ts`):

1. **Garment cut-out** (`src/lib/providers/segment/`). The default segmenter runs IMG.LY's open-source background-removal model on CPU through onnxruntime-node; the weights ship with the package, so it needs no key or network and takes 3-5 s per photo. The foreground mask is then refined into a *garment* mask: for a clearly coloured garment, white or grey regions at the top and bottom of the foreground (mannequin neck, shoulders, the stand) are dropped, and only the largest blob is kept. Ivory and black garments skip the neutral trim because colour cannot separate them from a white mannequin. If the native runtime does not load, a sharp-based colour heuristic takes over (learns the garment palette from the centre, background from the border); it handles plain backgrounds but loses fine details such as gold embroidery on busy backgrounds. `SEGMENTER=mock` gives a fixed central mask for tests. Set `DEBUG_SEGMENT=1` to write masks, cut-outs and outputs to `.data/debug/`.
2. **Colour normalisation** (`estimateColourCast` in `src/lib/images.ts`). Grey-world on the non-garment area (whole image as fallback), damped to 70% and clamped to ±18% per channel, so tungsten light is corrected without flattening a deliberately warm photo.
3. **Routing by `photoType`** (new field on the garment analysis, filled by both vision providers). Mannequin photos take the exact route: a person generator (`src/lib/providers/person/`) draws the model and backdrop around the cut-out and the original garment pixels are pasted back through the feathered mask, so the garment is pixel-identical to the upload. Flat-lay, hanger and on-model photos go to the try-on providers as before, but with the cut-out on a plain light card instead of the cluttered shop photo. The studio tells owners with flat-lay or hanger photos to shoot on a mannequin for an exact match.
4. **Mechanical exact-match check** (`checkExactMatch`). Before the vision gate, the output is compared with the cut-out: mean Lab colour difference on a grid plus structural similarity on the masked area when the garment position is known (exact route), colour-palette presence and drift of the main colour when it is not (try-on route). Failures are rejected with the reason "garment changed" and refunded like any other gate failure.

The `MockPersonGenerator` composites the cut-out onto the placeholder model with a soft shadow; `GeminiPersonGenerator` calls Gemini's Interactions API (`gemini-nano-banana-2.1` by default) with the placed garment and its mask. Run the whole chain offline on the owner's real mannequin photo, writing every stage to `.data/debug/try-exact-mode/<timestamp>/`:

```bash
pnpm tsx --conditions=react-server scripts/try-exact-mode.ts
```

Pass another photo path, `--segmenter=heuristic`, `--model=<base model id>` or `--backdrop=<id>` to vary the run.

## Architecture in one paragraph

Next.js 16 (App Router, Server Actions) serves the UI and API. Uploads go straight to object storage through short-lived signed URLs; the server re-encodes every image (strips EXIF, caps pixels). A generation job is a database row; the worker tier (in-process or BullMQ) runs the pipeline: garment analysis → base-model selection → try-on provider with failover → finishing (watermark, provenance) → vision quality gate with one automatic retry → gallery. Credits are charged atomically up front and refunded per failed image. Every tenant-owned row carries `tenant_id` and every query goes through the tenant-scoped data-access layer in `src/lib/dal`.

```
src/
  app/            routes: (marketing) (auth) (app) + api/ + actions/
  components/     ui primitives, app shell, studio workbench
  lib/
    auth/         better-auth config, session helpers (role checks)
    dal/          tenant-scoped data access (garments, jobs, credits, audit)
    db/           Drizzle schema + client (PGlite or Postgres)
    jobs/         the generation pipeline and worker bootstrap
    providers/    tryon/ (mock, fashn, google) and vision/ (mock, claude)
    queue/        in-process and BullMQ adapters
    storage/      local and S3 adapters with signed URLs
    base-models/  curated library catalogue + dev renderer
drizzle/          SQL migrations (generated with `pnpm db:generate`)
scripts/          seed, migrate, worker
```

## Commands

```bash
pnpm dev            # start the app (worker runs in-process without REDIS_URL)
pnpm typecheck      # tsc
pnpm lint           # eslint
pnpm test           # node test runner (scripts/test.mjs)
pnpm test:e2e       # Playwright end-to-end tests (see below)
pnpm db:generate    # regenerate migrations after editing src/lib/db/schema.ts
pnpm db:migrate     # apply migrations to DATABASE_URL (also happens at boot)
pnpm db:rls         # apply drizzle/rls.sql (row-level security) to DATABASE_URL
pnpm worker         # standalone worker (REDIS_URL required)
```

### End-to-end tests

`pnpm test:e2e` runs the Playwright suite in [`e2e/`](e2e/) through the whole product flow in one browser session: sign in with a one-time code, create a boutique (100 trial credits), upload `public/samples/sample-kurta.jpg`, generate two images and see the balance drop to 75, then open the gallery and download a JPEG. No API keys are needed.

[`playwright.config.ts`](playwright.config.ts) starts its own `pnpm dev` on a free port (or `E2E_PORT`) with an isolated embedded database (`./.data/e2e-pg`), isolated local storage (`./.data/e2e-storage`), mock providers and `E2E_TEST=1`. That flag enables `GET /api/dev/last-otp?email=…`, which returns the latest sign-in code printed to the console; the route answers 404 whenever `NODE_ENV` is `production` or the flag is absent. Each run uses a fresh email, so the e2e database can be reused; delete `./.data/e2e-*` to start clean. Traces and screenshots for failures land in `./.data/e2e-results`.

```bash
pnpm exec playwright install chromium   # once per machine; CI uses --with-deps
```

Next 16 holds a lock on `.next/dev`, so stop any other `pnpm dev` running in this folder before `pnpm test:e2e`.

## Deployment

Target layout, all in Mumbai: the web tier on **Vercel** (`bom1`), the worker and Redis on **Fly.io** (`bom`) or Railway, managed Postgres and object storage in the same region. Local development is unaffected by any of this: without `DATABASE_URL` and `REDIS_URL` everything still runs in one process on PGlite.

### Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request: `pnpm install --frozen-lockfile`, `next typegen`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Branch protection on `main` should require the `typecheck, lint, test` check.

### Database: migrations and row-level security

1. Create the Postgres database and an **owner** role (the one that runs DDL). Point `DATABASE_URL` at it and run `pnpm db:migrate`. The app also applies pending migrations at boot (`src/lib/db/index.ts`), so a deploy with a new migration self-heals.
2. Apply the second fence: `pnpm db:rls` runs [`drizzle/rls.sql`](drizzle/rls.sql) as the owner. It creates a non-superuser `vastra_app` role (`NOBYPASSRLS`), enables row-level security on `garments`, `generation_jobs`, `generated_images`, `credit_ledger`, `payments`, `share_links`, `audit_log` and `tenant_settings`, and adds policies keyed on `current_setting('app.tenant_id', true)`. It is idempotent. Pass `VASTRA_APP_PASSWORD` to set the role's password in the same run.
3. The app pins the tenant per transaction with `withTenant(db, tenantId, fn)` from [`src/lib/db/tenant.ts`](src/lib/db/tenant.ts), which runs `SELECT set_config('app.tenant_id', $1, true)` (transaction-local, pooler-safe) before `fn`. The data-access layer does not use it yet; its explicit `tenant_id` predicates remain the only fence until that follow-up lands.
4. Only after the DAL goes through `withTenant`, switch the web and worker `DATABASE_URL` to the `vastra_app` role. Table owners bypass RLS (the file deliberately does not `FORCE ROW LEVEL SECURITY`), so applying `rls.sql` today changes nothing for the owner connection. With `vastra_app`, a query that forgets `withTenant` sees no rows and can insert none.

Keep two connection strings: the owner URL for `pnpm db:migrate` and `pnpm db:rls`, and the `vastra_app` URL for the running app once step 4 applies.

### Web tier on Vercel

[`vercel.json`](vercel.json) sets the Next.js framework preset, region `bom1`, and frozen-lockfile installs. Import the repository in Vercel, then set the environment variables from `.env.example` in the Vercel project (at minimum `APP_URL`, `AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, `STORAGE_DRIVER=s3` with the `S3_*` keys, the provider keys, `RESEND_API_KEY`, the `RAZORPAY_*` secrets and `PLATFORM_ADMIN_EMAILS`). With `REDIS_URL` set the web tier only enqueues; it never runs generations in-process. Serverless functions are stateless, so `STORAGE_DRIVER=local` and PGlite are not usable on Vercel.

### Worker on Fly.io (Mumbai)

The worker is a plain Node process built from the [`Dockerfile`](Dockerfile) (Node 22, pnpm 10, runs `scripts/worker.ts` through `tsx` with `--conditions=react-server`). [`fly.toml`](fly.toml) pins the app to region `bom`, gives it 2 GB for sharp, exposes no ports, and drains in-flight jobs on `SIGTERM`.

```bash
fly launch --no-deploy --copy-config
```

```bash
fly secrets set DATABASE_URL=... REDIS_URL=... AUTH_SECRET=... STORAGE_DRIVER=s3 S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... TRYON_PROVIDERS=fashn,google FASHN_API_KEY=... VISION_PROVIDER=claude ANTHROPIC_API_KEY=...
```

```bash
fly deploy
```

Create Redis in the same region (`fly redis create` in `bom`, or a Railway Redis in Mumbai) and give both Vercel and Fly the same `REDIS_URL`. The worker must see the same `DATABASE_URL`, storage bucket and provider keys as the web tier. Scale with `fly scale count 2` or raise `WORKER_CONCURRENCY`; each in-flight job holds one provider call and a few hundred MB of image buffers.

The same image runs anywhere that takes a Dockerfile (Railway: add a service from the repo, set the variables, no start command needed since the image defines `CMD`).

### Pre-launch checklist

- `pnpm db:migrate` then `pnpm db:rls` against the production database, as the owner.
- Razorpay and Resend webhooks pointed at the Vercel `APP_URL`.
- `APP_URL` set to the final domain before the first sign-in email goes out (it is baked into auth callbacks and share links).
- Secrets live only in Vercel and Fly; nothing in the repository, nothing in the image.

## Security notes

Passwordless auth (email OTP, Google), HttpOnly/Secure cookies, server-side role checks against the membership table, signed upload and read URLs, magic-byte image validation and re-encoding, per-tenant rate limits and a daily spend cap, idempotent job and payment endpoints, HMAC-verified webhooks, a strict CSP and security headers in `src/proxy.ts`, and an audit log of every create/delete/share/download. Provider API keys live only on the server. See the requirements document for the full threat model and the launch checklist (penetration test, C2PA signing certificate, Postgres row-level security policies).
