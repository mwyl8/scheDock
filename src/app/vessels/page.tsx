import Link from "next/link";
import { searchVessels } from "@/lib/data";

type Props = {
  searchParams: Promise<{ q?: string; id?: string }>;
};

export default async function VesselsPage({ searchParams }: Props) {
  const params = await searchParams;
  const vessels = await searchVessels(params.q ?? "");

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="md:max-w-lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Directory
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold leading-none sm:text-5xl">
            Vessels
          </h1>
          <p className="mt-3 text-sm text-muted">
            {vessels.length} vessel{vessels.length === 1 ? "" : "s"}
            {params.q ? ` matching “${params.q}”` : ""}. A blank length means you
            must enter feet when creating a booking.
          </p>
        </div>
        <form className="flex flex-wrap gap-2 md:justify-end">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name or operator…"
            className="wm-input w-full min-w-[14rem] sm:w-56"
          />
          <button type="submit" className="wm-btn wm-btn-accent">
            Search
          </button>
        </form>
      </div>

      {vessels.length === 0 ? (
        <div className="wm-panel p-8">
          <p className="text-sm text-muted">
            No vessels found. Add one from New booking, or run the spreadsheet
            import if this database is empty.
          </p>
        </div>
      ) : (
        <div className="wm-panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-ink bg-panel font-mono text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Length</th>
                <th className="px-3 py-2 font-medium">Operator</th>
                <th className="px-3 py-2 font-medium">Bookings</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {vessels.map((v, i) => (
                <tr
                  key={v.id}
                  className={`border-b border-ink/10 ${i % 2 === 1 ? "bg-panel/50" : ""}`}
                >
                  <td className="px-3 py-2.5 font-semibold">{v.name}</td>
                  <td className="px-3 py-2.5 font-mono text-muted">
                    {v.lengthFt != null ? `${v.lengthFt}'` : "-"}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{v.operator ?? "-"}</td>
                  <td className="px-3 py-2.5 font-mono">{v._count.reservations}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Link href={`/vessels/${v.id}`} className="wm-link">
                      View history
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
