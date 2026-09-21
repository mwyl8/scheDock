import { describe, expect, it } from "vitest";
import {
  clampYmd,
  formatIsoDate,
  isoToDisplay,
  normalizeDateInput,
  normalizeIsoDate,
} from "@/lib/dates";

describe("clampYmd / formatIsoDate", () => {
  it("clamps Feb 31 to Feb 29 in a leap year", () => {
    expect(formatIsoDate(2024, 2, 31)).toBe("2024-02-29");
    expect(clampYmd(2024, 2, 31)).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("clamps Feb 31 to Feb 28 in a common year", () => {
    expect(formatIsoDate(2025, 2, 31)).toBe("2025-02-28");
  });

  it("clamps Apr 31 to Apr 30", () => {
    expect(formatIsoDate(2026, 4, 31)).toBe("2026-04-30");
  });

  it("leaves valid days alone", () => {
    expect(formatIsoDate(2026, 2, 28)).toBe("2026-02-28");
    expect(formatIsoDate(2024, 2, 29)).toBe("2024-02-29");
  });
});

describe("normalizeDateInput", () => {
  it("parses US-style 2/31/2025 → 2025-02-28", () => {
    expect(normalizeDateInput("2/31/2025")).toBe("2025-02-28");
  });

  it("parses leap-year 2/31/2024 → 2024-02-29", () => {
    expect(normalizeDateInput("2/31/2024")).toBe("2024-02-29");
  });

  it("parses ISO overflow days", () => {
    expect(normalizeDateInput("2025-02-31")).toBe("2025-02-28");
  });

  it("accepts dashes and dots", () => {
    expect(normalizeDateInput("2-31-2025")).toBe("2025-02-28");
    expect(normalizeDateInput("2.31.2025")).toBe("2025-02-28");
  });

  it("returns null for incomplete input", () => {
    expect(normalizeDateInput("2/31")).toBeNull();
    expect(normalizeDateInput("")).toBeNull();
    expect(normalizeDateInput("not-a-date")).toBeNull();
  });
});

describe("iso helpers", () => {
  it("round-trips display", () => {
    expect(isoToDisplay("2025-02-28")).toBe("2/28/2025");
    expect(normalizeIsoDate("2024-02-31")).toBe("2024-02-29");
  });
});
