import { prisma } from "@/lib/prisma";
import { datesOverlap } from "@/lib/scheduling";

export async function getBerths() {
  return prisma.berth.findMany({ orderBy: { name: "asc" } });
}

export async function getScheduleMonth(year: number, monthIndex: number) {
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const end = new Date(Date.UTC(year, monthIndex + 1, 0));

  const [berths, reservations] = await Promise.all([
    prisma.berth.findMany({ orderBy: { name: "asc" } }),
    prisma.reservation.findMany({
      where: {
        startDate: { lte: end },
        endDate: { gte: start },
      },
      include: { vessel: true, berth: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  // Mark conflicts (any overlapping pair on same berth)
  const conflictIds = new Set<string>();
  for (let i = 0; i < reservations.length; i++) {
    for (let j = i + 1; j < reservations.length; j++) {
      const a = reservations[i];
      const b = reservations[j];
      if (a.berthId !== b.berthId) continue;
      if (datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) {
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }

  return { berths, reservations, conflictIds: [...conflictIds], start, end };
}

export async function searchVessels(q: string) {
  const query = q.trim();
  return prisma.vessel.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { operator: { contains: query, mode: "insensitive" } },
            { normalizedName: { contains: query.toLowerCase() } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    take: 100,
    include: {
      _count: { select: { reservations: true } },
    },
  });
}

export async function getVessel(id: string) {
  return prisma.vessel.findUnique({
    where: { id },
    include: {
      reservations: {
        include: { berth: true },
        orderBy: { startDate: "desc" },
        take: 50,
      },
    },
  });
}

export async function getIssueCounts(filters: { type?: string; year?: number }) {
  return prisma.importIssue.groupBy({
    by: ["type"],
    where: {
      ...(filters.type ? { type: filters.type as never } : {}),
      ...(filters.year ? { year: filters.year } : {}),
    },
    _count: true,
    orderBy: { type: "asc" },
  });
}

export async function getIssues(filters: {
  type?: string;
  year?: number;
}) {
  // ERROR first, then WARNING, then INFO so serious notes aren't buried
  // under thousands of "lone cell = 1 day" infos.
  return prisma.importIssue.findMany({
    where: {
      ...(filters.type ? { type: filters.type as never } : {}),
      ...(filters.year ? { year: filters.year } : {}),
    },
    include: {
      reservation: { include: { berth: true, vessel: true } },
      reservationB: { include: { berth: true, vessel: true } },
    },
    orderBy: [{ severity: "desc" }, { year: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}
