import { NewReservationForm } from "@/components/NewReservationForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewReservationPage() {
  const [berths, vessels] = await Promise.all([
    prisma.berth.findMany({ orderBy: { name: "asc" } }),
    prisma.vessel.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, lengthFt: true },
    }),
  ]);

  if (berths.length === 0) {
    return (
      <div className="wm-panel max-w-lg p-8">
        <h1 className="font-display text-3xl font-extrabold">No berths yet</h1>
        <p className="mt-2 text-sm text-muted">
          Run <code className="font-mono">npm run db:seed</code> before booking.
        </p>
      </div>
    );
  }

  return <NewReservationForm berths={berths} vessels={vessels} />;
}
