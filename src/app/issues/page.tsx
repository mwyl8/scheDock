import Link from "next/link";
import { getIssues } from "@/lib/data";

const TYPES = [
  "DOUBLE_BOOKING",
  "DOES_NOT_FIT",
  "UNKNOWN_LENGTH",
  "DURATION_UNCERTAIN",
  "LENGTH_DISCREPANCY",
  "UNPARSED_CELL",
] as const;

type Props = {
  searchParams: Promise<{ type?: string; year?: string }>;
};

export default async function IssuesPage({ searchParams }: Props) {
  const params = await searchParams;
  const year = params.year ? Number(params.year) : undefined;
  const issues = await getIssues({ type: params.type, year });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Ledger discrepancies
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold leading-none sm:text-5xl">
            Chart notes from
            <span className="text-accent"> the import</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted">
            Double claims, hulls that do not fit, lone cells treated as one day,
            LOA mismatches. Filter, then jump back to the tide board.
          </p>
        </div>
        <form className="flex flex-wrap gap-2 lg:justify-end">
          <select
            name="type"
            defaultValue={params.type ?? ""}
            className="wm-select w-auto min-w-[12rem]"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
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

      {issues.length === 0 ? (
        <div className="wm-panel p-8 text-sm text-muted">
          No issues for this filter. Either the import is clean here, or you
          filtered too hard.
        </div>
      ) : (
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
                    className={`border-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                      issue.severity === "ERROR"
                        ? "border-accent bg-accent text-paper"
                        : issue.severity === "WARNING"
                          ? "border-ink bg-ink text-paper"
                          : "border-ink bg-paper text-ink"
                    }`}
                  >
                    {issue.type}
                  </span>
                  {issue.year != null && (
                    <span className="font-mono text-xs text-muted">{issue.year}</span>
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
                  <Link href={href} className="wm-link mt-2 inline-block text-sm">
                    Jump to that month
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
