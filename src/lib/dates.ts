import { getDaysInMonth } from "date-fns";

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when the string is a full ISO calendar date with a plausible year. */
export function isCompleteDate(s: string): boolean {
  if (!ISO_RE.test(s)) return false;
  const y = Number(s.slice(0, 4));
  return y >= 1900 && y <= 2100;
}

/** Clamp day into the real length of that month (2/31 → 2/28 or 2/29). */
export function clampYmd(year: number, month: number, day: number): {
  year: number;
  month: number;
  day: number;
} {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new RangeError("Invalid calendar parts");
  }
  const y = Math.trunc(year);
  const m = Math.min(12, Math.max(1, Math.trunc(month)));
  const dim = getDaysInMonth(new Date(y, m - 1, 1));
  const d = Math.min(dim, Math.max(1, Math.trunc(day)));
  return { year: y, month: m, day: d };
}

export function formatIsoDate(year: number, month: number, day: number): string {
  const c = clampYmd(year, month, day);
  return `${String(c.year).padStart(4, "0")}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/** Display as M/D/YYYY (no leading zeros) for typing. */
export function isoToDisplay(iso: string): string {
  if (!isCompleteDate(iso)) return "";
  const [, ys, ms, ds] = iso.match(ISO_RE)!;
  return `${Number(ms)}/${Number(ds)}/${Number(ys)}`;
}

/**
 * Parse typed dates and clamp impossible days to the last day of that month.
 * Accepts ISO (YYYY-MM-DD) and US-style M/D/YYYY (also -, . separators).
 * Returns null if the input is empty or not recognizable yet.
 */
export function normalizeDateInput(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})([-/.\s])(\d{1,2})\2(\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[3]);
    const day = Number(iso[4]);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
    return formatIsoDate(year, month, day);
  }

  const us = s.match(/^(\d{1,2})([-/.\s])(\d{1,2})\2(\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[3]);
    const year = Number(us[4]);
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
    return formatIsoDate(year, month, day);
  }

  // Partial typing like "2/31" without year — not complete yet
  return null;
}

/** Normalize an ISO string that may have an overflow day (e.g. 2024-02-31). */
export function normalizeIsoDate(iso: string): string | null {
  const m = iso.trim().match(ISO_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  return formatIsoDate(year, month, day);
}

/** UTC midnight for a clamped ISO calendar date. */
export function parseDateOnly(iso: string): Date {
  const normalized = normalizeIsoDate(iso);
  if (!normalized) throw new RangeError(`Invalid date: ${iso}`);
  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
