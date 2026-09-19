import Link from "next/link";
import { notFound } from "next/navigation";
import { getVessel } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export default async function VesselDetailPage({ params }: Props) {
  const { id } = await params;
  const vessel = await getVessel(id);
  if (!vessel) notFound();

  return (
    <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
      <div>
        <Link href="/vessels" className="wm-link text-sm">
          ← All vessels
        </Link>
        <h1 className="font-display mt-4 text-4xl font-extrabold leading-none">
          {vessel.name}
        </h1>
        <dl className="mt-6 space-y-3 border-2 border-ink bg-panel p-4 text-sm">
          <div>
            <dt className="wm-label">Prefix</dt>
            <dd>{vessel.typePrefix ?? "None on file"}</dd>
          </div>
          <div>
            <dt className="wm-label">Length</dt>
            <dd className="font-mono">
              {vessel.lengthFt != null ? `${vessel.lengthFt}'` : "Unknown - fix before booking"}
            </dd>
          </div>
          <div>
            <dt className="wm-label">Operator</dt>
            <dd>{vessel.operator ?? "-"}</dd>
          </div>
        </dl>
        {vessel.contactNotes && (
          <pre className="mt-4 whitespace-pre-wrap border-2 border-ink p-3 font-mono text-xs text-muted">
            {vessel.contactNotes}
          </pre>
        )}
      </div>

      <div>
        <h2 className="font-display text-2xl font-bold">Past & planned stays</h2>
        {vessel.reservations.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No berth time recorded yet.</p>
        ) : (
          <ul className="mt-4 border-2 border-ink">
            {vessel.reservations.map((r, i) => (
              <li
                key={r.id}
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm ${
                  i % 2 === 0 ? "bg-paper" : "bg-panel"
                } border-b border-ink/15 last:border-0`}
              >
                <span>
                  <strong>{r.berth.name}</strong>
                  <span className="mx-2 text-muted">·</span>
                  <span className="font-mono text-xs">
                    {r.startDate.toISOString().slice(0, 10)} →{" "}
                    {r.endDate.toISOString().slice(0, 10)}
                  </span>
                </span>
                <Link
                  href={`/?year=${r.startDate.getUTCFullYear()}&month=${r.startDate.getUTCMonth() + 1}`}
                  className="wm-link"
                >
                  Open board
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
