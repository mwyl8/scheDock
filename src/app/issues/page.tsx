import Link from "next/link";
import { getIssueCounts, getIssues } from "@/lib/data";

const TYPES = [
  "DOUBLE_BOOKING",
  "DOES_NOT_FIT",
  "UNKNOWN_LENGTH",
  "DURATION_UNCERTAIN",
  "LENGTH_DISCREPANCY",
] as const;

type IssueType = (typeof TYPES)[number];

const TYPE_META: Record<
  IssueType,
  { label: string; description: string }
> = {
  DOUBLE_BOOKING: {
    label: "Double booking",
    description:
      "Two stays were recorded on the same berth for overlapping days. Both are kept here so the old conflict is still visible.",
  },
  DOES_NOT_FIT: {
    label: "Does not fit",
    description:
      "A boat was assigned to a berth shorter than the length on file for that vessel.",
  },
  UNKNOWN_LENGTH: {
    label: "Unknown length",
    description:
      "A stay was recorded for a boat that had no length on file, so fit could not be checked.",
  },
  DURATION_UNCERTAIN: {
    label: "Single-day mark",
    description:
      "Only one day was marked for this stay, so it is stored as a single day. Older records do not say whether a longer visit was intended.",
  },
  LENGTH_DISCREPANCY: {
    label: "Length discrepancy",
    description:
      "Older records listed two different lengths for the same boat. The clearer notes value was kept.",
  },
};

type Props = {
  searchParams: Promise<{ type?: string; year?: string; page?: string }>;
};

function buildIssuesHref(opts: {
  type?: string;
  year?: number;
  page?: number;
}) {
  const q = new URLSearchParams();
  if (opts.type) q.set("type", opts.type);
  if (opts.year) q.set("year", String(opts.year));
  if (opts.page && opts.page > 1) q.set("page", String(opts.page));
  const s = q.toString();
  return s ? `/issues?${s}` : "/issues";
}

function isIssueType(v: string | undefined): v is IssueType {
  return !!v && (TYPES as readonly string[]).includes(v);
}

function typeLabel(type: string): string {
  if (isIssueType(type)) return TYPE_META[type].label;
  return type.replaceAll("_", " ").toLowerCase();
}

/** Hide empty / unused issue kinds from chips and totals. */
const VISIBLE_TYPES = new Set<string>(TYPES);

export default async function IssuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? Number(params.year) : undefined;
  const page = params.page ? Math.max(1, Number(params.page) || 1) : 1;
  const activeType = isIssueType(params.type) ? params.type : undefined;
  const filters = { type: activeType, year, page };
  const [{ issues, total, pageSize }, counts] = await Promise.all([
    getIssues(filters),
    // Counts always include every type (year filter only) so chips stay useful
    getIssueCounts({ year }),
  ]);
  const visibleCounts = counts.filter((c) => VISIBLE_TYPES.has(c.type));
  const countTotal = visibleCounts.reduce((n, c) => n + c._count, 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            History
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold leading-none sm:text-5xl">
            Issue log
          </h1>
          <p className="mt-3 max-w-lg text-sm text-muted">
            A record of what went wrong in older dock bookings—overlapping stays,
            missing lengths, unclear visit lengths, and conflicting vessel data.
            New bookings are checked up front so these mistakes are harder to
            repeat. Filter by type or year to browse the log.
          </p>
        </div>
        <form className="flex flex-wrap gap-2 lg:justify-end">
          <select
            name="type"
            defaultValue={activeType ?? ""}
            className="wm-select w-auto min-w-[12rem]"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </select>
          <input
            name="year"
            type="number"
            placeholder="Year"
            defaultValue={params.year ?? ""}
            className="wm-input w-24"
          />
          <button type="submit" className="wm-btn wm-btn-accent">
            Filter
          </button>
        </form>
      </div>

      <div className="wm-panel p-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {year ? `Counts for ${year}` : "Counts by type"} · {countTotal} total
          {activeType ? ` · viewing ${TYPE_META[activeType].label.toLowerCase()} (${total})` : ""}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const n = visibleCounts.find((c) => c.type === t)?._count ?? 0;
            if (!activeType && n === 0) return null;
            return (
              <li key={t}>
                <Link
                  href={buildIssuesHref({ type: t, year })}
                  className={`inline-block border-2 px-2 py-1 text-xs ${
                    activeType === t
                      ? "border-accent bg-accent text-paper"
                      : "border-ink text-ink hover:bg-ink hover:text-white"
                  }`}
                >
                  {TYPE_META[t].label} · {n}
                </Link>
              </li>
            );
          })}
          {activeType && (
            <li>
              <Link
                href={buildIssuesHref({ year })}
                className="wm-link text-xs"
              >
                Clear filter
              </Link>
            </li>
          )}
        </ul>
      </div>

      {activeType && (
        <div className="border-l-4 border-accent bg-panel px-4 py-3">
          <h2 className="font-display text-xl font-bold">
            {TYPE_META[activeType].label}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {TYPE_META[activeType].description}
          </p>
        </div>
      )}

      {issues.length === 0 ? (
        <div className="wm-panel p-8 text-sm text-muted">
          Nothing in the log for this filter. Try another type or year, or clear
          the filters.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted">
            <span>
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} of {total} · page {page} /{" "}
              {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={buildIssuesHref({
                    type: activeType,
                    year,
                    page: page - 1,
                  })}
                  className="wm-btn"
                >
                  ← Newer
                </Link>
              ) : (
                <span className="wm-btn opacity-40">← Newer</span>
              )}
              {page < totalPages ? (
                <Link
                  href={buildIssuesHref({
                    type: activeType,
                    year,
                    page: page + 1,
                  })}
                  className="wm-btn"
                >
                  Older →
                </Link>
              ) : (
                <span className="wm-btn opacity-40">Older →</span>
              )}
            </div>
          </div>
          <ul className="space-y-0 border-2 border-ink">
            {issues.map((issue, i) => {
              const res = issue.reservation;
              const href = res
                ? `/?year=${res.startDate.getUTCFullYear()}&month=${res.startDate.getUTCMonth() + 1}`
                : null;
              return (
                <li
                  key={issue.id}
                  className={`border-b border-ink/15 px-4 py-4 last:border-0 ${
                    i % 2 === 0 ? "bg-paper" : "bg-panel"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        issue.severity === "ERROR"
                          ? "border-accent bg-accent text-paper"
                          : issue.severity === "WARNING"
                            ? "border-ink bg-ink text-paper"
                            : "border-ink bg-paper text-ink"
                      }`}
                    >
                      {typeLabel(issue.type)}
                    </span>
                    {issue.year != null && (
                      <span className="font-mono text-xs text-muted">
                        {issue.year}
                      </span>
                    )}
                    {issue.sheet && (
                      <span className="font-mono text-xs text-muted">
                        {issue.sheet}
                        {issue.cellRef ? ` ${issue.cellRef}` : ""}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm">{issue.message}</p>
                  {href && (
                    <Link
                      href={href}
                      className="wm-link mt-2 inline-block text-sm"
                    >
                      Jump to schedule
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end gap-2">
            {page > 1 && (
              <Link
                href={buildIssuesHref({
                  type: activeType,
                  year,
                  page: page - 1,
                })}
                className="wm-btn"
              >
                ← Newer
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildIssuesHref({
                  type: activeType,
                  year,
                  page: page + 1,
                })}
                className="wm-btn"
              >
                Older →
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
