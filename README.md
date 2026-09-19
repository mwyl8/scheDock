# scheDock - Dock Scheduling System

MVP berth scheduler for a marine research facility. Browse historical dock usage (imported from Excel), create new reservations with live conflict/fit checks, and review import data-quality issues.

## What it does

- **Schedule grid** - berths as rows, days as columns, month navigation + jump-to-date
- **Reservations** - vessel or event bookings with validation (overlap, vessel fit, date range)
- **Vessels** - searchable directory with booking history
- **Issues** - import QA report (double bookings, misfits, uncertain durations, etc.)
- **Import** - idempotent loader for `data/dock_schedule.xlsx` (1997-2019)

## Stack

Next.js (App Router, TypeScript), Tailwind CSS, Prisma, Neon Postgres, Zod, Vitest, ExcelJS. Deploy target: Vercel.

## Local setup

1. **Env vars** - ensure `.env` (or `.env.local`) has:

   ```bash
   DATABASE_URL="postgresql://…?sslmode=require"   # pooled (Neon)
   DIRECT_URL="postgresql://…?sslmode=require"     # non-pooled / direct
   ```

   If your Neon dashboard only exposes `DATABASE_URL_UNPOOLED`, map that value to `DIRECT_URL`.

2. **Install & migrate**

   ```bash
   npm install
   npx prisma migrate deploy
   npm run db:seed
   ```

3. **Import history** (optional but recommended)

   ```bash
   npm run import
   ```

4. **Run**

   ```bash
   npm run dev
   ```

5. **Tests / build**

   ```bash
   npm test
   npm run build
   ```

## Import

`npm run import` reads `data/dock_schedule.xlsx` with ExcelJS:

- Year sheets `1997`…`2019` → reservations
- `Science` / `Yachts` → vessel directory (length, operator, contacts)
- Ignores `8YR Dock Summary` and `Tours`
- Idempotent: wipes IMPORT reservations + ImportIssues (and orphan vessels), then reloads

Parser notes are documented in `scripts/import.ts` (month headers, day columns without formula evaluation, merges, cross-month continuations, LOA vs name-length discrepancies).

## Architecture

| Area | Location |
|------|----------|
| Domain rules (pure) | `src/lib/scheduling.ts` |
| Unit tests | `src/lib/scheduling.test.ts` |
| Zod schemas | `src/lib/validators.ts` |
| Server actions | `src/lib/actions.ts` |
| Data loaders | `src/lib/data.ts` |
| Prisma schema | `prisma/schema.prisma` |
| Import CLI | `scripts/import.ts` |
| UI | `src/app/*`, `src/components/*` |

**APP bookings** are validated in application code (friendly conflict messages) **and** at the DB with a Postgres exclusion constraint (`btree_gist` + inclusive `daterange`) that applies only where `source = 'APP'`. Imported history is exempt so real conflicts remain visible as issues.

## Assumptions

1. **Whole-berth occupancy** - one reservation occupies the entire berth for its days (no side-by-side packing by vessel length). Deliberate MVP simplification; see “Next” below.
2. **Inclusive dates** - `startDate`/`endDate` are calendar dates with no time. A booking ending on day X conflicts with one starting on day X.
3. **Lone schedule cells** - a single non-merged cell is treated as a **1-day** reservation and logged as `DURATION_UNCERTAIN`.
4. **LOA precedence** - if a directory line’s name length conflicts with an `LOA: N'` note, store the LOA and log `LENGTH_DISCREPANCY`.
5. **Events have no length** - only vessel bookings are checked against berth length.
6. **Import history is exempt** from the DB exclusion constraint (conflicts are surfaced, not deleted).
7. **No auth** for this MVP - anyone with the URL can create/edit APP bookings.

## Known limitations

- Import day-column alignment follows “column of literal `1` + offset”; some workbook months have odd layouts (e.g. stray month headers) and may skip or clamp days.
- Many imported vessels lack length → many `UNKNOWN_LENGTH` issues until directory data is completed.
- Schedule grid loads one month at a time; very dense months can feel busy on small screens.
- No audit log, roles, or CSV export yet.

## What I’d do next

- Auth / roles (dock ops vs read-only science staff)
- Side-by-side berth packing by remaining length
- Draft / beam (and maybe depth) constraints
- Recurring events and multi-berth holds
- Audit log of create/update/delete
- CSV / iCal export
- Faster import via `createMany` + bulk issue insert

## Vercel env vars

Set these in the Vercel project (Settings → Environment Variables):

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon **pooled** connection string |
| `DIRECT_URL` | Neon **direct / non-pooled** connection string |

Also run migrations on deploy (e.g. `prisma migrate deploy` in a build command or release step):

```bash
prisma generate && prisma migrate deploy && next build
```

(The repo `npm run build` already runs `prisma generate && next build`; add `migrate deploy` in CI/CD as appropriate.)
