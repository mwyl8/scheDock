/**
 * Import historical dock schedules from data/dock_schedule.xlsx.
 *
 * Idempotent: deletes all IMPORT reservations, import-sourced vessels with no
 * APP bookings, and all ImportIssues, then reloads from the workbook.
 *
 * Run: npm run import
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import path from "node:path";
import {
  ImportIssueSeverity,
  ImportIssueType,
  PrismaClient,
  ReservationKind,
} from "@prisma/client";
import {
  datesOverlap,
  normalizeVesselName,
  parseVesselPrefix,
  startsWithVesselPrefix,
} from "../src/lib/scheduling";

const prisma = new PrismaClient();
const WORKBOOK = path.join(process.cwd(), "data", "dock_schedule.xlsx");

const BERTH_DEFS = [
  { name: "North Pier West", lengthFt: 410 },
  { name: "North Pier Face", lengthFt: 75 },
  { name: "North Pier East", lengthFt: 240 },
  { name: "Inner Channel", lengthFt: 55 },
  { name: "South Float West", lengthFt: 90 },
  { name: "South Float East", lengthFt: 90 },
] as const;

const MONTH_NAMES: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const IGNORE_SHEETS = new Set(["8YR Dock Summary", "Tours"]);

type PendingIssue = {
  type: ImportIssueType;
  severity: ImportIssueSeverity;
  message: string;
  sheet?: string;
  cellRef?: string;
  year?: number;
  reservationKey?: string;
  reservationBKey?: string;
};

type PendingReservation = {
  key: string;
  berthName: string;
  kind: ReservationKind;
  displayName: string;
  normalizedName: string;
  startDate: Date;
  endDate: Date;
  sheet: string;
  cellRef: string;
  durationUncertain: boolean;
};

type VesselDraft = {
  name: string;
  normalizedName: string;
  typePrefix: string | null;
  lengthFt: number | null;
  operator: string | null;
  contactNotes: string | null;
};

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function colLetter(col: number): string {
  let n = col;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(row: number, col: number): string {
  return `${colLetter(col)}${row}`;
}

/** Flatten ExcelJS cell values (rich text, hyperlinks, formulas) to a string. */
function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((t) => t.text).join("").trim();
    }
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    // Formula with no cached result - caller should not rely on evaluation
    if ("formula" in value) return "";
    if ("error" in value) return "";
  }
  return String(value).trim();
}

function parseMonthHeader(
  text: string,
  sheetYear: number | null,
): { monthIndex: number; year: number } | null {
  const m = text
    .trim()
    .match(
      /^(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/i,
    );
  if (!m) return null;
  const monthIndex = MONTH_NAMES[m[1].toLowerCase()];
  const year = m[2] ? Number(m[2]) : sheetYear;
  if (year == null || Number.isNaN(year)) return null;
  return { monthIndex, year };
}

function parseBerthLabel(text: string): string | null {
  const m = text.trim().match(/^(.+?)\s*-\s*(\d+)\s*'\s*$/);
  if (!m) return null;
  const name = m[1].trim();
  if (BERTH_DEFS.some((b) => b.name === name)) return name;
  return null;
}

/**
 * Vessel directory line: "R/V Iron Skua 72'" - prefix + name + optional length.
 */
function parseVesselDirectoryLine(text: string): {
  displayName: string;
  normalizedName: string;
  typePrefix: string | null;
  lengthFt: number | null;
} | null {
  if (!startsWithVesselPrefix(text)) return null;
  const { prefix, remainder } = parseVesselPrefix(text);
  const lengthMatch = remainder.match(/^(.*?)\s+(\d+)\s*'\s*$/);
  if (lengthMatch) {
    const namePart = lengthMatch[1].trim();
    const displayName = prefix ? `${prefix} ${namePart}` : namePart;
    return {
      displayName,
      normalizedName: normalizeVesselName(displayName),
      typePrefix: prefix,
      lengthFt: Number(lengthMatch[2]),
    };
  }
  const displayName = prefix ? `${prefix} ${remainder}` : remainder;
  return {
    displayName,
    normalizedName: normalizeVesselName(displayName),
    typePrefix: prefix,
    lengthFt: null,
  };
}

function extractLoa(text: string): number | null {
  const m = text.match(/LOA:\s*(\d+)\s*'/i);
  return m ? Number(m[1]) : null;
}

function classifyReservation(raw: string): {
  kind: ReservationKind;
  displayName: string;
  normalizedName: string;
} {
  const text = raw.trim();
  if (startsWithVesselPrefix(text)) {
    // Strip trailing length if present in schedule cells
    const cleaned = text.replace(/\s+\d+\s*'\s*$/, "").trim();
    const { prefix, remainder } = parseVesselPrefix(cleaned);
    const displayName = prefix ? `${prefix} ${remainder}` : cleaned;
    return {
      kind: "VESSEL",
      displayName,
      normalizedName: normalizeVesselName(displayName),
    };
  }
  return {
    kind: "EVENT",
    displayName: text,
    normalizedName: normalizeVesselName(text),
  };
}

/**
 * Locate the column that holds day "1" on the month header row or the next 1-2 rows.
 * Do not evaluate formulas: after finding col of 1, day = colOffset + 1.
 */
function findDayOneColumn(sheet: ExcelJS.Worksheet, headerRow: number): number | null {
  for (let dr = 0; dr <= 2; dr++) {
    const row = sheet.getRow(headerRow + dr);
    for (let col = 2; col <= 40; col++) {
      const value = row.getCell(col).value;
      // Prefer literal 1; formulas like =SUM(B3+1) are NOT evaluated  - 
      // only the cell that literally contains 1 counts as day one.
      if (value === 1 || value === "1") return col;
      if (typeof value === "object" && value && "result" in value && value.result === 1) {
        // Cached result of 1 is acceptable only if this is the seed cell;
        // still prefer a literal. Treat as day-one if no formula chain.
        if (!("formula" in value) || !value.formula) return col;
      }
    }
  }
  // Fallback: scan for literal 1 even inside formula-result cells when it's the leftmost day
  for (let dr = 0; dr <= 2; dr++) {
    const row = sheet.getRow(headerRow + dr);
    for (let col = 2; col <= 40; col++) {
      const value = row.getCell(col).value;
      if (value === 1 || value === "1") return col;
      // First formula whose cached result is 1 - common when day 1 itself is a formula (rare)
      if (
        typeof value === "object" &&
        value &&
        "formula" in value &&
        (value as ExcelJS.CellFormulaValue).result === 1
      ) {
        return col;
      }
    }
  }
  return null;
}

/** Build merge master map: "row,col" → { startCol, endCol, text } */
function buildMergeMap(sheet: ExcelJS.Worksheet): Map<string, { startCol: number; endCol: number; text: string }> {
  const map = new Map<string, { startCol: number; endCol: number; text: string }>();
  const merges = sheet.model.merges ?? [];
  for (const range of merges) {
    // "B8:M8"
    const m = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!m) continue;
    const startCol = columnIndex(m[1]);
    const endCol = columnIndex(m[3]);
    const startRow = Number(m[2]);
    const endRow = Number(m[4]);
    const text = cellText(sheet.getRow(startRow).getCell(startCol).value);
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        map.set(`${r},${c}`, { startCol, endCol, text });
      }
    }
  }
  return map;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

type MonthBlock = {
  headerRow: number;
  monthIndex: number;
  year: number;
  dayOneCol: number;
  days: number;
  berthRows: { row: number; berthName: string }[];
};

function findMonthBlocks(sheet: ExcelJS.Worksheet, sheetYear: number | null): MonthBlock[] {
  const blocks: MonthBlock[] = [];
  const maxRow = sheet.rowCount || 200;

  for (let r = 1; r <= maxRow; r++) {
    const label = cellText(sheet.getRow(r).getCell(1).value);
    const parsed = parseMonthHeader(label, sheetYear);
    if (!parsed) continue;

    const dayOneCol = findDayOneColumn(sheet, r);
    if (!dayOneCol) {
      console.warn(`  ! No day-1 column for ${label} on ${sheet.name} row ${r}`);
      continue;
    }

    const days = daysInMonth(parsed.year, parsed.monthIndex);
    const berthRows: { row: number; berthName: string }[] = [];

    // Berth rows follow until the next month header
    for (let rr = r + 1; rr <= maxRow; rr++) {
      const a = cellText(sheet.getRow(rr).getCell(1).value);
      if (parseMonthHeader(a, sheetYear)) break;
      const berthName = parseBerthLabel(a);
      if (berthName) berthRows.push({ row: rr, berthName });
    }

    blocks.push({
      headerRow: r,
      monthIndex: parsed.monthIndex,
      year: parsed.year,
      dayOneCol,
      days,
      berthRows,
    });
  }
  return blocks;
}

/**
 * Extract per-day labels for a berth row within a month.
 * Merged cells → same label across span; lone cells kept as-is.
 */
function dayLabelsForBerthRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  dayOneCol: number,
  days: number,
  mergeMap: Map<string, { startCol: number; endCol: number; text: string }>,
): { day: number; text: string; col: number; fromMerge: boolean }[] {
  const out: { day: number; text: string; col: number; fromMerge: boolean }[] = [];
  const row = sheet.getRow(rowNum);

  for (let day = 1; day <= days; day++) {
    const col = dayOneCol + day - 1;
    const merge = mergeMap.get(`${rowNum},${col}`);
    if (merge) {
      // Only emit once per merge at the first valid day of the merge within this month
      const firstDayCol = Math.max(merge.startCol, dayOneCol);
      if (col !== firstDayCol) continue;
      const lastDayCol = Math.min(merge.endCol, dayOneCol + days - 1);
      const text = merge.text || cellText(row.getCell(merge.startCol).value);
      if (!text) continue;
      for (let c = firstDayCol; c <= lastDayCol; c++) {
        const d = c - dayOneCol + 1;
        out.push({ day: d, text, col: c, fromMerge: true });
      }
      // Skip ahead - loop will continue; we already pushed all days
      // Adjust by continuing; days already added may duplicate if we don't skip.
      // Better approach: mark days covered.
    } else {
      const text = cellText(row.getCell(col).value);
      if (text) out.push({ day, text, col, fromMerge: false });
    }
  }

  // Deduplicate by day (merge path can over-add if not careful)
  const byDay = new Map<number, { day: number; text: string; col: number; fromMerge: boolean }>();
  for (const item of out) {
    if (!byDay.has(item.day)) byDay.set(item.day, item);
  }
  return [...byDay.values()].sort((a, b) => a.day - b.day);
}

function buildReservationsForMonth(
  sheet: ExcelJS.Worksheet,
  block: MonthBlock,
  mergeMap: Map<string, { startCol: number; endCol: number; text: string }>,
): PendingReservation[] {
  const pending: PendingReservation[] = [];

  for (const { row, berthName } of block.berthRows) {
    const labels = dayLabelsForBerthRow(
      sheet,
      row,
      block.dayOneCol,
      block.days,
      mergeMap,
    );
    if (labels.length === 0) continue;

    // Collapse consecutive same names
    let i = 0;
    while (i < labels.length) {
      const start = labels[i];
      const classified = classifyReservation(start.text);
      let endDay = start.day;
      let j = i + 1;
      while (j < labels.length) {
        const next = labels[j];
        const nextClass = classifyReservation(next.text);
        if (
          next.day === endDay + 1 &&
          nextClass.normalizedName === classified.normalizedName
        ) {
          endDay = next.day;
          j++;
        } else break;
      }

      const spanDays = labels.slice(i, j);
      const spanLen = endDay - start.day + 1;
      // Lone cell (1 day, not from a merge covering >1 day in this month) → uncertain
      const mergeSpan =
        start.fromMerge &&
        spanDays.every((d) => d.fromMerge) &&
        spanLen > 1;
      const durationUncertain = spanLen === 1 && !mergeSpan && !start.fromMerge;

      pending.push({
        key: `${sheet.name}|${berthName}|${block.year}-${String(block.monthIndex + 1).padStart(2, "0")}-${String(start.day).padStart(2, "0")}|${endDay}|${classified.normalizedName}`,
        berthName,
        kind: classified.kind,
        displayName: classified.displayName,
        normalizedName: classified.normalizedName,
        startDate: utcDate(block.year, block.monthIndex, start.day),
        endDate: utcDate(block.year, block.monthIndex, endDay),
        sheet: sheet.name,
        cellRef: cellRef(row, start.col),
        durationUncertain,
      });

      i = j;
    }
  }

  return pending;
}

/**
 * Merge continuations across month boundaries when the same normalized name
 * occupies the last day of one month and day 1 of the next on the same berth.
 */
function mergeAcrossMonths(reservations: PendingReservation[]): PendingReservation[] {
  // Group by berth + normalized name, sort by start
  const byBerth = new Map<string, PendingReservation[]>();
  for (const r of reservations) {
    const k = `${r.berthName}||${r.normalizedName}`;
    if (!byBerth.has(k)) byBerth.set(k, []);
    byBerth.get(k)!.push(r);
  }

  const merged: PendingReservation[] = [];
  for (const group of byBerth.values()) {
    group.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    let current = { ...group[0] };
    for (let i = 1; i < group.length; i++) {
      const next = group[i];
      const dayAfterCurrent = new Date(current.endDate);
      dayAfterCurrent.setUTCDate(dayAfterCurrent.getUTCDate() + 1);
      if (dayAfterCurrent.getTime() === next.startDate.getTime()) {
        current.endDate = next.endDate;
        current.durationUncertain = false;
        current.key = `${current.key}>${next.key}`;
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }
  return merged;
}

function parseVesselDirectories(
  wb: ExcelJS.Workbook,
  issues: PendingIssue[],
): Map<string, VesselDraft> {
  const vessels = new Map<string, VesselDraft>();

  for (const sheetName of ["Science", "Yachts"]) {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) continue;

    let current: VesselDraft | null = null;
    const noteParts: string[] = [];

    const flush = () => {
      if (!current) return;
      if (noteParts.length) {
        current.contactNotes = noteParts.join("\n");
      }
      const existing = vessels.get(current.normalizedName);
      if (existing) {
        // Prefer longer known length / richer notes
        if (current.lengthFt != null && existing.lengthFt == null) {
          existing.lengthFt = current.lengthFt;
        }
        if (!existing.operator && current.operator) existing.operator = current.operator;
        if (current.contactNotes) {
          existing.contactNotes = [existing.contactNotes, current.contactNotes]
            .filter(Boolean)
            .join("\n");
        }
      } else {
        vessels.set(current.normalizedName, current);
      }
      current = null;
      noteParts.length = 0;
    };

    const maxRow = sheet.rowCount || 500;
    for (let r = 1; r <= maxRow; r++) {
      const row = sheet.getRow(r);
      // Gather all cell texts on the row
      const parts: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const t = cellText(cell.value);
        if (t) parts.push(t);
      });
      if (parts.length === 0) continue;

      const first = parts[0];
      // Skip header
      if (/^vessel$/i.test(first)) continue;

      const vesselLine = parseVesselDirectoryLine(first);
      if (vesselLine) {
        flush();
        current = {
          name: vesselLine.displayName,
          normalizedName: vesselLine.normalizedName,
          typePrefix: vesselLine.typePrefix,
          lengthFt: vesselLine.lengthFt,
          operator: null,
          contactNotes: null,
        };

        // Remaining cells on the vessel line may be operator / contacts / LOA
        for (let i = 1; i < parts.length; i++) {
          const p = parts[i];
          const loa = extractLoa(p);
          if (loa != null) {
            if (current.lengthFt != null && current.lengthFt !== loa) {
              issues.push({
                type: "LENGTH_DISCREPANCY",
                severity: "WARNING",
                message: `LOA ${loa}' conflicts with name length ${current.lengthFt}' for ${current.name}; using LOA.`,
                sheet: sheetName,
                cellRef: cellRef(r, i + 1),
              });
              current.lengthFt = loa;
            } else if (current.lengthFt == null) {
              current.lengthFt = loa;
            }
            noteParts.push(p);
          } else if (!current.operator && !/^cell:/i.test(p) && !p.includes("@") && !/^capt\./i.test(p)) {
            // Heuristic: first non-contact org-like string is operator
            current.operator = p;
          } else {
            noteParts.push(p);
          }
        }
        continue;
      }

      // Continuation rows for current vessel
      if (current) {
        for (const p of parts) {
          const loa = extractLoa(p);
          if (loa != null) {
            if (current.lengthFt != null && current.lengthFt !== loa) {
              issues.push({
                type: "LENGTH_DISCREPANCY",
                severity: "WARNING",
                message: `LOA ${loa}' conflicts with name length ${current.lengthFt}' for ${current.name}; using LOA.`,
                sheet: sheetName,
                cellRef: cellRef(r, 1),
              });
              current.lengthFt = loa;
            } else if (current.lengthFt == null) {
              current.lengthFt = loa;
            }
          }
          if (!current.operator && !/^cell:/i.test(p) && !p.includes("@") && !/^loa:/i.test(p)) {
            // Could be operator on continuation
            if (!/^capt\./i.test(p) && parts.indexOf(p) === 0) {
              // leave as notes unless clearly an org - keep simple: all to notes
            }
          }
          noteParts.push(p);
        }
      }
    }
    flush();
  }

  return vessels;
}

async function ensureBerths() {
  for (const b of BERTH_DEFS) {
    await prisma.berth.upsert({
      where: { name: b.name },
      create: { name: b.name, lengthFt: b.lengthFt },
      update: { lengthFt: b.lengthFt },
    });
  }
}

async function wipeImportData() {
  // Delete issues first, then IMPORT reservations.
  // Keep vessels that may have been created by APP; remove orphans after.
  await prisma.importIssue.deleteMany();
  await prisma.reservation.deleteMany({ where: { source: "IMPORT" } });

  // Remove vessels with no remaining reservations
  await prisma.vessel.deleteMany({
    where: { reservations: { none: {} } },
  });
}

async function main() {
  console.log("Reading", WORKBOOK);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(WORKBOOK);

  const issues: PendingIssue[] = [];
  const sheetCounts: Record<string, number> = {};

  console.log("Parsing vessel directories (Science, Yachts)…");
  const directoryVessels = parseVesselDirectories(wb, issues);
  console.log(`  Directory vessels: ${directoryVessels.size}`);

  let allPending: PendingReservation[] = [];

  for (const sheet of wb.worksheets) {
    if (IGNORE_SHEETS.has(sheet.name)) continue;
    if (sheet.name === "Science" || sheet.name === "Yachts") continue;

    const sheetYear = /^\d{4}$/.test(sheet.name) ? Number(sheet.name) : null;
    if (sheetYear == null) {
      console.log(`  Skipping non-year sheet: ${sheet.name}`);
      continue;
    }

    const mergeMap = buildMergeMap(sheet);
    const blocks = findMonthBlocks(sheet, sheetYear);
    let count = 0;
    for (const block of blocks) {
      const monthRes = buildReservationsForMonth(sheet, block, mergeMap);
      count += monthRes.length;
      allPending.push(...monthRes);
    }
    sheetCounts[sheet.name] = count;
    console.log(`  Sheet ${sheet.name}: ${blocks.length} months, ${count} raw spans`);
  }

  console.log("Merging cross-month continuations…");
  const beforeMerge = allPending.length;
  allPending = mergeAcrossMonths(allPending);
  console.log(`  ${beforeMerge} → ${allPending.length} reservations`);

  // Duration-uncertain issues
  for (const r of allPending) {
    if (r.durationUncertain) {
      issues.push({
        type: "DURATION_UNCERTAIN",
        severity: "INFO",
        message: `Lone cell for "${r.displayName}" on ${r.berthName}; treated as 1-day booking.`,
        sheet: r.sheet,
        cellRef: r.cellRef,
        year: r.startDate.getUTCFullYear(),
        reservationKey: r.key,
      });
    }
  }

  console.log("Writing to database (idempotent wipe + reload)…");
  await ensureBerths();
  await wipeImportData();

  const berths = await prisma.berth.findMany();
  const berthByName = new Map(berths.map((b) => [b.name, b]));

  // Upsert vessels from directory + from reservations
  const vesselIdByNorm = new Map<string, string>();

  for (const v of directoryVessels.values()) {
    const row = await prisma.vessel.upsert({
      where: { normalizedName: v.normalizedName },
      create: {
        name: v.name,
        normalizedName: v.normalizedName,
        typePrefix: v.typePrefix,
        lengthFt: v.lengthFt,
        operator: v.operator,
        contactNotes: v.contactNotes,
      },
      update: {
        name: v.name,
        typePrefix: v.typePrefix ?? undefined,
        lengthFt: v.lengthFt ?? undefined,
        operator: v.operator ?? undefined,
        contactNotes: v.contactNotes ?? undefined,
      },
    });
    vesselIdByNorm.set(v.normalizedName, row.id);
  }

  // Create any vessels referenced only in the schedule
  for (const r of allPending) {
    if (r.kind !== "VESSEL") continue;
    if (vesselIdByNorm.has(r.normalizedName)) continue;
    const { prefix } = parseVesselPrefix(r.displayName);
    const row = await prisma.vessel.upsert({
      where: { normalizedName: r.normalizedName },
      create: {
        name: r.displayName,
        normalizedName: r.normalizedName,
        typePrefix: prefix,
        lengthFt: null,
      },
      update: {},
    });
    vesselIdByNorm.set(r.normalizedName, row.id);
  }

  // Insert reservations in batches
  const keyToId = new Map<string, string>();
  const BATCH = 100;
  for (let i = 0; i < allPending.length; i += BATCH) {
    const chunk = allPending.slice(i, i + BATCH);
    await prisma.$transaction(
      chunk.map((r) => {
        const berth = berthByName.get(r.berthName);
        if (!berth) throw new Error(`Unknown berth ${r.berthName}`);
        return prisma.reservation.create({
          data: {
            berthId: berth.id,
            kind: r.kind,
            vesselId: r.kind === "VESSEL" ? vesselIdByNorm.get(r.normalizedName) : null,
            eventName: r.kind === "EVENT" ? r.displayName : null,
            startDate: r.startDate,
            endDate: r.endDate,
            source: "IMPORT",
            notes: `Imported from ${r.sheet} ${r.cellRef}`,
          },
        });
      }),
    );
  }

  // Re-fetch to map keys → ids (match on berth+dates+name)
  const saved = await prisma.reservation.findMany({
    where: { source: "IMPORT" },
    include: { vessel: true, berth: true },
  });

  function reservationLabel(r: (typeof saved)[0]): string {
    return r.kind === "VESSEL" ? (r.vessel?.name ?? "Unknown vessel") : (r.eventName ?? "Event");
  }

  // Map pending keys to saved ids
  for (const p of allPending) {
    const match = saved.find(
      (s) =>
        s.berth.name === p.berthName &&
        s.startDate.getTime() === p.startDate.getTime() &&
        s.endDate.getTime() === p.endDate.getTime() &&
        (s.kind === "VESSEL"
          ? s.vessel?.normalizedName === p.normalizedName
          : normalizeVesselName(s.eventName ?? "") === p.normalizedName),
    );
    if (match) keyToId.set(p.key, match.id);
  }

  // Post-import: overlaps + fit issues
  console.log("Detecting overlaps and fit problems…");
  for (let i = 0; i < saved.length; i++) {
    for (let j = i + 1; j < saved.length; j++) {
      const a = saved[i];
      const b = saved[j];
      if (a.berthId !== b.berthId) continue;
      if (!datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
      issues.push({
        type: "DOUBLE_BOOKING",
        severity: "ERROR",
        message: `Double booking on ${a.berth.name}: "${reservationLabel(a)}" and "${reservationLabel(b)}"`,
        sheet: a.notes?.match(/from (\S+)/)?.[1],
        year: a.startDate.getUTCFullYear(),
        reservationKey: a.id,
        reservationBKey: b.id,
      });
    }
  }

  for (const r of saved) {
    if (r.kind !== "VESSEL") continue;
    const len = r.vessel?.lengthFt;
    if (len == null) {
      issues.push({
        type: "UNKNOWN_LENGTH",
        severity: "WARNING",
        message: `Vessel "${r.vessel?.name}" has unknown length (berth ${r.berth.name}, ${r.berth.lengthFt}').`,
        year: r.startDate.getUTCFullYear(),
        reservationKey: r.id,
      });
    } else if (len > r.berth.lengthFt) {
      issues.push({
        type: "DOES_NOT_FIT",
        severity: "ERROR",
        message: `Vessel "${r.vessel?.name}" (${len}') does not fit ${r.berth.name} (${r.berth.lengthFt}').`,
        year: r.startDate.getUTCFullYear(),
        reservationKey: r.id,
      });
    }
  }

  // Persist issues
  for (const issue of issues) {
    const reservationId =
      issue.reservationKey && keyToId.has(issue.reservationKey)
        ? keyToId.get(issue.reservationKey)
        : issue.reservationKey && saved.some((s) => s.id === issue.reservationKey)
          ? issue.reservationKey
          : keyToId.get(issue.reservationKey ?? "") ??
            (saved.some((s) => s.id === issue.reservationKey) ? issue.reservationKey : null);

    const reservationBId =
      issue.reservationBKey && saved.some((s) => s.id === issue.reservationBKey)
        ? issue.reservationBKey
        : keyToId.get(issue.reservationBKey ?? "") ?? null;

    await prisma.importIssue.create({
      data: {
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        sheet: issue.sheet ?? null,
        cellRef: issue.cellRef ?? null,
        year: issue.year ?? null,
        reservationId: reservationId ?? null,
        reservationBId: reservationBId ?? null,
      },
    });
  }

  // Summary
  const vesselCount = await prisma.vessel.count();
  const reservationCount = await prisma.reservation.count({ where: { source: "IMPORT" } });
  const issueRows = await prisma.importIssue.groupBy({
    by: ["type"],
    _count: true,
  });

  console.log("\n========== IMPORT SUMMARY ==========");
  console.log("Reservations per year sheet:");
  for (const [sheet, n] of Object.entries(sheetCounts).sort()) {
    console.log(`  ${sheet}: ${n} raw spans`);
  }
  console.log(`Total IMPORT reservations: ${reservationCount}`);
  console.log(`Total vessels: ${vesselCount}`);
  console.log("Issues by type:");
  for (const row of issueRows.sort((a, b) => a.type.localeCompare(b.type))) {
    console.log(`  ${row.type}: ${row._count}`);
  }
  console.log("====================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
