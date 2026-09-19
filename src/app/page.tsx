import { ScheduleGrid } from "@/components/ScheduleGrid";
import { getScheduleMonth } from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ year?: string; month?: string; focus?: string }>;
};

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;
  const year = Number(params.year) || 2012;
  const month = Number(params.month) || 1;
  const monthIndex = Math.min(11, Math.max(0, month - 1));

  const { berths, reservations, conflictIds } = await getScheduleMonth(year, monthIndex);

  const mapped = reservations.map((r) => ({
    id: r.id,
    berthId: r.berthId,
    kind: r.kind as "VESSEL" | "EVENT",
    source: r.source as "IMPORT" | "APP",
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    label:
      r.kind === "VESSEL" ? (r.vessel?.name ?? "Vessel") : (r.eventName ?? "Event"),
    notes: r.notes,
    vesselId: r.vesselId,
    eventName: r.eventName,
    vesselLengthFt: r.vessel?.lengthFt ?? null,
  }));

  if (berths.length === 0) {
    return (
      <div className="wm-panel max-w-xl p-8">
        <h1 className="font-display text-3xl font-extrabold">No berths in the database</h1>
        <p className="mt-3 text-sm text-muted">
          Seed the six piers, then load the workbook:
        </p>
        <pre className="mt-4 border-2 border-ink bg-panel p-3 font-mono text-xs">
          npm run db:seed{"\n"}npm run import
        </pre>
      </div>
    );
  }

  return (
    <ScheduleGrid
      year={year}
      monthIndex={monthIndex}
      berths={berths}
      reservations={mapped}
      conflictIds={conflictIds}
    />
  );
}
