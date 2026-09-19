"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatDateRange,
  normalizeVesselName,
  parseVesselPrefix,
  validateBooking,
  type ExistingReservation,
} from "@/lib/scheduling";
import {
  createReservationSchema,
  createVesselSchema,
  updateReservationSchema,
  updateVesselLengthSchema,
} from "@/lib/validators";

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function reservationLabel(r: {
  kind: string;
  eventName: string | null;
  vessel: { name: string } | null;
}): string {
  if (r.kind === "VESSEL") return r.vessel?.name ?? "Vessel";
  return r.eventName ?? "Event";
}

async function loadExistingForBerth(
  berthId: string,
  excludeId?: string,
): Promise<ExistingReservation[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      berthId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: { vessel: true },
  });
  return rows.map((r) => ({
    id: r.id,
    berthId: r.berthId,
    startDate: r.startDate,
    endDate: r.endDate,
    label: reservationLabel(r),
  }));
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export async function createVesselAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; name: string; lengthFt: number | null }>> {
  const parsed = createVesselSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid vessel" };
  }

  let name = parsed.data.name.trim();
  let typePrefix = parsed.data.typePrefix?.trim() || null;
  if (!typePrefix) {
    const detected = parseVesselPrefix(name);
    typePrefix = detected.prefix;
    if (detected.prefix) name = `${detected.prefix} ${detected.remainder}`;
  } else if (!name.toLowerCase().startsWith(typePrefix.toLowerCase())) {
    name = `${typePrefix} ${name}`;
  }

  const normalizedName = normalizeVesselName(name);
  try {
    const vessel = await prisma.vessel.create({
      data: {
        name,
        normalizedName,
        typePrefix,
        lengthFt: parsed.data.lengthFt ?? null,
        operator: parsed.data.operator?.trim() || null,
        contactNotes: parsed.data.contactNotes?.trim() || null,
      },
    });
    revalidatePath("/vessels");
    revalidatePath("/");
    return {
      ok: true,
      data: { id: vessel.id, name: vessel.name, lengthFt: vessel.lengthFt },
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "A vessel with that name already exists." };
    }
    throw e;
  }
}

export async function updateVesselLengthAction(
  raw: unknown,
): Promise<ActionResult<{ id: string; name: string; lengthFt: number }>> {
  const parsed = updateVesselLengthSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid length" };
  }
  const vessel = await prisma.vessel.update({
    where: { id: parsed.data.vesselId },
    data: { lengthFt: parsed.data.lengthFt },
  });
  revalidatePath("/vessels");
  revalidatePath("/reservations/new");
  revalidatePath("/");
  return {
    ok: true,
    data: { id: vessel.id, name: vessel.name, lengthFt: vessel.lengthFt! },
  };
}

export async function createReservationAction(
  raw: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createReservationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const startDate = parseDateOnly(data.startDate);
  const endDate = parseDateOnly(data.endDate);

  const berth = await prisma.berth.findUnique({ where: { id: data.berthId } });
  if (!berth) return { ok: false, error: "Berth not found." };

  let vessel: { lengthFt: number | null; name: string } | null = null;
  if (data.kind === "VESSEL" && data.vesselId) {
    if (data.vesselLengthFt != null) {
      vessel = await prisma.vessel.update({
        where: { id: data.vesselId },
        data: { lengthFt: data.vesselLengthFt },
      });
    } else {
      vessel = await prisma.vessel.findUnique({ where: { id: data.vesselId } });
    }
    if (!vessel) return { ok: false, error: "Vessel not found." };
  }

  const existing = await loadExistingForBerth(berth.id);
  const check = validateBooking({
    berthId: berth.id,
    kind: data.kind,
    vessel,
    startDate,
    endDate,
    berth,
    existing,
  });
  if (!check.ok) return { ok: false, error: check.message };

  try {
    const created = await prisma.reservation.create({
      data: {
        berthId: berth.id,
        kind: data.kind,
        vesselId: data.kind === "VESSEL" ? data.vesselId : null,
        eventName: data.kind === "EVENT" ? data.eventName!.trim() : null,
        startDate,
        endDate,
        notes: data.notes?.trim() || null,
        source: "APP",
      },
    });
    revalidatePath("/");
    revalidatePath("/vessels");
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        error: "Conflicts with an existing APP booking on this berth (database constraint).",
      };
    }
    // Exclusion constraint often surfaces as P2034 or raw error
    const msg = e instanceof Error ? e.message : String(e);
    if (/exclusion|overlap|Reservation_app_no_overlap/i.test(msg)) {
      return {
        ok: false,
        error: "Conflicts with an existing APP booking on this berth.",
      };
    }
    throw e;
  }
}

export async function updateReservationAction(
  raw: unknown,
): Promise<ActionResult> {
  const parsed = updateReservationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const existingRow = await prisma.reservation.findUnique({
    where: { id: data.id },
  });
  if (!existingRow) return { ok: false, error: "Reservation not found." };
  if (existingRow.source !== "APP") {
    return { ok: false, error: "Imported reservations are read-only." };
  }

  const startDate = parseDateOnly(data.startDate);
  const endDate = parseDateOnly(data.endDate);
  const berth = await prisma.berth.findUnique({ where: { id: data.berthId } });
  if (!berth) return { ok: false, error: "Berth not found." };

  let vessel: { lengthFt: number | null } | null = null;
  if (data.kind === "VESSEL" && data.vesselId) {
    vessel = await prisma.vessel.findUnique({ where: { id: data.vesselId } });
    if (!vessel) return { ok: false, error: "Vessel not found." };
  }

  const existing = await loadExistingForBerth(berth.id, data.id);
  const check = validateBooking({
    berthId: berth.id,
    kind: data.kind,
    vessel,
    startDate,
    endDate,
    berth,
    existing,
  });
  if (!check.ok) return { ok: false, error: check.message };

  try {
    await prisma.reservation.update({
      where: { id: data.id },
      data: {
        berthId: berth.id,
        kind: data.kind,
        vesselId: data.kind === "VESSEL" ? data.vesselId : null,
        eventName: data.kind === "EVENT" ? data.eventName!.trim() : null,
        startDate,
        endDate,
        notes: data.notes?.trim() || null,
      },
    });
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/exclusion|overlap|Reservation_app_no_overlap/i.test(msg)) {
      return { ok: false, error: "Conflicts with an existing APP booking on this berth." };
    }
    throw e;
  }
}

export async function deleteReservationAction(
  id: string,
): Promise<ActionResult> {
  const row = await prisma.reservation.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Reservation not found." };
  if (row.source !== "APP") {
    return { ok: false, error: "Imported reservations are read-only." };
  }
  await prisma.reservation.delete({ where: { id } });
  revalidatePath("/");
  return { ok: true };
}

export async function validateReservationPreview(raw: {
  berthId: string;
  kind: "VESSEL" | "EVENT";
  vesselId?: string | null;
  /** Client-entered LOA override (not yet saved). */
  vesselLengthFt?: number | null;
  startDate: string;
  endDate: string;
  excludeId?: string;
}): Promise<{
  fitMessage: string;
  conflictMessage: string | null;
  ok: boolean;
}> {
  const berth = await prisma.berth.findUnique({ where: { id: raw.berthId } });
  if (!berth) {
    return { fitMessage: "Select a berth", conflictMessage: null, ok: false };
  }
  if (!isCompleteDate(raw.startDate) || !isCompleteDate(raw.endDate)) {
    return { fitMessage: "", conflictMessage: null, ok: false };
  }

  const startDate = parseDateOnly(raw.startDate);
  const endDate = parseDateOnly(raw.endDate);
  let vessel: { lengthFt: number | null } | null = null;
  if (raw.kind === "VESSEL" && raw.vesselId) {
    vessel = await prisma.vessel.findUnique({ where: { id: raw.vesselId } });
    if (vessel && raw.vesselLengthFt != null) {
      vessel = { ...vessel, lengthFt: raw.vesselLengthFt };
    }
  }

  const existing = await loadExistingForBerth(berth.id, raw.excludeId);
  const check = validateBooking({
    berthId: berth.id,
    kind: raw.kind,
    vessel,
    startDate,
    endDate,
    berth,
    existing,
  });

  const { fitStatusMessage } = await import("@/lib/scheduling");
  const fitMessage = fitStatusMessage(raw.kind, vessel, berth);
  return {
    fitMessage,
    conflictMessage: check.ok
      ? null
      : check.code === "UNKNOWN_LENGTH"
        ? check.message
        : check.message,
    ok: check.ok,
  };
}

function isCompleteDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  return y >= 1900 && y <= 2100;
}

export async function findAvailableBerths(raw: {
  vesselId: string;
  startDate: string;
  endDate: string;
  vesselLengthFt?: number | null;
}): Promise<
  ActionResult<{ berths: { id: string; name: string; lengthFt: number; fitMessage: string }[] }>
> {
  if (!raw.vesselId || !isCompleteDate(raw.startDate) || !isCompleteDate(raw.endDate)) {
    return { ok: false, error: "Vessel and complete dates are required." };
  }
  const row = await prisma.vessel.findUnique({ where: { id: raw.vesselId } });
  if (!row) return { ok: false, error: "Vessel not found." };
  const vessel = {
    ...row,
    lengthFt: raw.vesselLengthFt ?? row.lengthFt,
  };

  const startDate = parseDateOnly(raw.startDate);
  const endDate = parseDateOnly(raw.endDate);
  const berths = await prisma.berth.findMany({ orderBy: { name: "asc" } });
  const allRes = await prisma.reservation.findMany({ include: { vessel: true } });

  const { fitStatusMessage, berthIsAvailable } = await import("@/lib/scheduling");

  const available = berths
    .filter((berth) => {
      const existing: ExistingReservation[] = allRes
        .filter((r) => r.berthId === berth.id)
        .map((r) => ({
          id: r.id,
          berthId: r.berthId,
          startDate: r.startDate,
          endDate: r.endDate,
          label: reservationLabel(r),
        }));
      return berthIsAvailable({
        berthId: berth.id,
        kind: "VESSEL",
        vessel,
        startDate,
        endDate,
        berth,
        existing,
      });
    })
    .map((berth) => ({
      id: berth.id,
      name: berth.name,
      lengthFt: berth.lengthFt,
      fitMessage: fitStatusMessage("VESSEL", vessel, berth),
    }));

  return { ok: true, data: { berths: available } };
}

export async function getReservationDetail(id: string) {
  return prisma.reservation.findUnique({
    where: { id },
    include: {
      berth: true,
      vessel: true,
      issuesAsA: true,
      issuesAsB: true,
    },
  });
}

export { formatDateRange };
