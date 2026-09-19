import { describe, expect, it } from "vitest";
import {
  berthIsAvailable,
  datesOverlap,
  findOverlaps,
  fitStatusMessage,
  normalizeVesselName,
  startsWithVesselPrefix,
  validateBooking,
  validateDateRange,
  validateNoOverlap,
  validateVesselFitsBerth,
} from "./scheduling";

const d = (iso: string) => new Date(iso + "T00:00:00.000Z");

describe("datesOverlap (inclusive)", () => {
  it("detects overlapping ranges", () => {
    expect(datesOverlap(d("2024-06-01"), d("2024-06-05"), d("2024-06-03"), d("2024-06-10"))).toBe(
      true,
    );
  });

  it("treats same-day boundary as conflict (inclusive dates)", () => {
    // A ends Jun 5, B starts Jun 5 → conflict
    expect(datesOverlap(d("2024-06-01"), d("2024-06-05"), d("2024-06-05"), d("2024-06-08"))).toBe(
      true,
    );
  });

  it("allows adjacent ranges (end then next day start)", () => {
    expect(datesOverlap(d("2024-06-01"), d("2024-06-05"), d("2024-06-06"), d("2024-06-08"))).toBe(
      false,
    );
  });

  it("detects containment", () => {
    expect(datesOverlap(d("2024-06-01"), d("2024-06-10"), d("2024-06-03"), d("2024-06-04"))).toBe(
      true,
    );
  });
});

describe("validateDateRange", () => {
  it("rejects end before start", () => {
    const r = validateDateRange(d("2024-06-10"), d("2024-06-01"));
    expect(r.ok).toBe(false);
  });

  it("allows single-day bookings", () => {
    expect(validateDateRange(d("2024-06-01"), d("2024-06-01")).ok).toBe(true);
  });
});

describe("validateVesselFitsBerth", () => {
  it("blocks vessels longer than the berth", () => {
    const r = validateVesselFitsBerth("VESSEL", { lengthFt: 100 }, { lengthFt: 90 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DOES_NOT_FIT");
  });

  it("blocks unknown vessel length", () => {
    const r = validateVesselFitsBerth("VESSEL", { lengthFt: null }, { lengthFt: 90 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNKNOWN_LENGTH");
  });

  it("allows fitting vessels", () => {
    expect(validateVesselFitsBerth("VESSEL", { lengthFt: 72 }, { lengthFt: 90 }).ok).toBe(true);
  });

  it("skips length checks for events", () => {
    expect(validateVesselFitsBerth("EVENT", null, { lengthFt: 55 }).ok).toBe(true);
  });
});

describe("overlap messaging", () => {
  const existing = [
    {
      id: "r1",
      berthId: "b1",
      startDate: d("2024-06-03"),
      endDate: d("2024-06-07"),
      label: "R/V Iron Skua",
    },
  ];

  it("names the conflicting booking", () => {
    const r = validateNoOverlap("b1", d("2024-06-05"), d("2024-06-10"), existing);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("R/V Iron Skua");
      expect(r.message).toMatch(/Jun/);
    }
  });

  it("ignores other berths", () => {
    expect(findOverlaps("b2", d("2024-06-05"), d("2024-06-10"), existing)).toHaveLength(0);
  });

  it("excludes self when editing", () => {
    expect(
      validateNoOverlap("b1", d("2024-06-03"), d("2024-06-07"), existing, "r1").ok,
    ).toBe(true);
  });
});

describe("validateBooking + events", () => {
  const berth = { lengthFt: 90 };
  const existing = [
    {
      id: "e1",
      berthId: "b1",
      startDate: d("2024-07-01"),
      endDate: d("2024-07-02"),
      label: "Community sail day",
    },
  ];

  it("validates a clean vessel booking", () => {
    const r = validateBooking({
      berthId: "b1",
      kind: "VESSEL",
      vessel: { lengthFt: 72 },
      startDate: d("2024-08-01"),
      endDate: d("2024-08-03"),
      berth,
      existing,
    });
    expect(r.ok).toBe(true);
    expect(fitStatusMessage("VESSEL", { lengthFt: 72 }, berth)).toBe(
      "Fits (72' in 90' berth)",
    );
  });

  it("events conflict on overlap but ignore length", () => {
    const r = validateBooking({
      berthId: "b1",
      kind: "EVENT",
      startDate: d("2024-07-02"),
      endDate: d("2024-07-02"),
      berth: { lengthFt: 55 },
      existing,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Community sail day");
  });

  it("berthIsAvailable mirrors validateBooking", () => {
    expect(
      berthIsAvailable({
        berthId: "b1",
        kind: "VESSEL",
        vessel: { lengthFt: 72 },
        startDate: d("2024-08-01"),
        endDate: d("2024-08-03"),
        berth,
        existing,
      }),
    ).toBe(true);
  });
});

describe("name helpers", () => {
  it("normalizes vessel names", () => {
    expect(normalizeVesselName("  R/V  Iron   Skua ")).toBe("r/v iron skua");
  });

  it("detects vessel prefixes", () => {
    expect(startsWithVesselPrefix("R/V Iron Skua")).toBe(true);
    expect(startsWithVesselPrefix("Tug Long Skua")).toBe(true);
    expect(startsWithVesselPrefix("Community sail day")).toBe(false);
  });
});
