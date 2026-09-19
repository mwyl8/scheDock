/**
 * Pure scheduling rules for dock reservations.
 *
 * Dates are inclusive calendar dates (no time component).
 * One reservation occupies the entire berth for its date range.
 */

export type ReservationKind = "VESSEL" | "EVENT";

export type ExistingReservation = {
  id: string;
  berthId: string;
  startDate: Date;
  endDate: Date;
  /** Display label used in conflict messages */
  label: string;
};

export type VesselFitInput = {
  lengthFt: number | null | undefined;
};

export type BerthFitInput = {
  lengthFt: number;
};

export type ValidationOk = { ok: true };
export type ValidationErr = { ok: false; code: string; message: string };
export type ValidationResult = ValidationOk | ValidationErr;

/** Normalize a calendar date to UTC midnight for stable day comparisons. */
export function toDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Inclusive date ranges overlap when neither ends strictly before the other starts. */
export function datesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  const as = toDateOnly(aStart).getTime();
  const ae = toDateOnly(aEnd).getTime();
  const bs = toDateOnly(bStart).getTime();
  const be = toDateOnly(bEnd).getTime();
  return as <= be && bs <= ae;
}

export function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (s.getTime() === e.getTime()) return fmt.format(s);
  return `${fmt.format(s)}-${fmt.format(e)}`;
}

export function validateDateRange(startDate: Date, endDate: Date): ValidationResult {
  const s = toDateOnly(startDate);
  const e = toDateOnly(endDate);
  if (e.getTime() < s.getTime()) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: "End date must be on or after the start date.",
    };
  }
  return { ok: true };
}

/**
 * Vessel must fit the berth. Unknown length blocks booking so staff enter LOA first.
 * Events have no length check.
 */
export function validateVesselFitsBerth(
  kind: ReservationKind,
  vessel: VesselFitInput | null | undefined,
  berth: BerthFitInput,
): ValidationResult {
  if (kind === "EVENT") return { ok: true };

  if (vessel == null || vessel.lengthFt == null) {
    return {
      ok: false,
      code: "UNKNOWN_LENGTH",
      message:
        "Vessel length is unknown. Enter the vessel’s length (LOA) before booking.",
    };
  }

  if (vessel.lengthFt > berth.lengthFt) {
    return {
      ok: false,
      code: "DOES_NOT_FIT",
      message: `Vessel is too long (${vessel.lengthFt}' in a ${berth.lengthFt}' berth).`,
    };
  }

  return { ok: true };
}

export function fitStatusMessage(
  kind: ReservationKind,
  vessel: VesselFitInput | null | undefined,
  berth: BerthFitInput,
): string {
  if (kind === "EVENT") return "Events have no length constraint.";
  if (vessel == null || vessel.lengthFt == null) {
    return "Length unknown - enter LOA to book.";
  }
  if (vessel.lengthFt > berth.lengthFt) {
    return `Too long (${vessel.lengthFt}' in ${berth.lengthFt}' berth)`;
  }
  return `Fits (${vessel.lengthFt}' in ${berth.lengthFt}' berth)`;
}

export function findOverlaps(
  berthId: string,
  startDate: Date,
  endDate: Date,
  existing: ExistingReservation[],
  excludeId?: string,
): ExistingReservation[] {
  return existing.filter(
    (r) =>
      r.berthId === berthId &&
      r.id !== excludeId &&
      datesOverlap(startDate, endDate, r.startDate, r.endDate),
  );
}

export function validateNoOverlap(
  berthId: string,
  startDate: Date,
  endDate: Date,
  existing: ExistingReservation[],
  excludeId?: string,
): ValidationResult {
  const conflicts = findOverlaps(berthId, startDate, endDate, existing, excludeId);
  if (conflicts.length === 0) return { ok: true };

  const first = conflicts[0];
  return {
    ok: false,
    code: "OVERLAP",
    message: `Conflicts with ${first.label}, ${formatDateRange(first.startDate, first.endDate)}.`,
  };
}

export type BookingInput = {
  berthId: string;
  kind: ReservationKind;
  vessel?: VesselFitInput | null;
  startDate: Date;
  endDate: Date;
  berth: BerthFitInput;
  existing: ExistingReservation[];
  excludeId?: string;
};

/** Run all APP booking rules. Returns the first failure, or ok. */
export function validateBooking(input: BookingInput): ValidationResult {
  const range = validateDateRange(input.startDate, input.endDate);
  if (!range.ok) return range;

  const fit = validateVesselFitsBerth(input.kind, input.vessel, input.berth);
  if (!fit.ok) return fit;

  return validateNoOverlap(
    input.berthId,
    input.startDate,
    input.endDate,
    input.existing,
    input.excludeId,
  );
}

/** True when a berth can accept this vessel for the given dates. */
export function berthIsAvailable(input: BookingInput): boolean {
  return validateBooking(input).ok;
}

export const VESSEL_TYPE_PREFIXES = [
  "R/V",
  "M/V",
  "F/V",
  "M/Y",
  "S/Y",
  "S/V",
  "OSV",
  "Tug",
  "Barge",
] as const;

export type VesselTypePrefix = (typeof VESSEL_TYPE_PREFIXES)[number];

/** Collapse whitespace, trim, lowercase - used as the unique vessel key. */
export function normalizeVesselName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Detect a leading vessel type prefix. Longer / more specific prefixes first
 * is already handled by ordering (OSV before single letters, etc.).
 */
export function parseVesselPrefix(
  text: string,
): { prefix: VesselTypePrefix | null; remainder: string } {
  const trimmed = text.trim();
  for (const prefix of VESSEL_TYPE_PREFIXES) {
    const re = new RegExp(`^${prefix.replace("/", "\\/")}\\s+`, "i");
    if (re.test(trimmed)) {
      return {
        prefix,
        remainder: trimmed.replace(re, "").trim(),
      };
    }
  }
  return { prefix: null, remainder: trimmed };
}

export function startsWithVesselPrefix(text: string): boolean {
  return parseVesselPrefix(text).prefix != null;
}
