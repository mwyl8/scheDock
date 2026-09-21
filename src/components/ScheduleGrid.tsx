"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteReservationAction,
  updateReservationAction,
} from "@/lib/actions";
import { DateField } from "@/components/DateField";
import { isCompleteDate, normalizeDateInput } from "@/lib/dates";

export type ScheduleReservation = {
  id: string;
  berthId: string;
  kind: "VESSEL" | "EVENT";
  source: "IMPORT" | "APP";
  startDate: string;
  endDate: string;
  label: string;
  notes: string | null;
  vesselId: string | null;
  eventName: string | null;
  vesselLengthFt: number | null;
};

export type ScheduleBerth = {
  id: string;
  name: string;
  lengthFt: number;
};

type Props = {
  year: number;
  monthIndex: number;
  berths: ScheduleBerth[];
  reservations: ScheduleReservation[];
  conflictIds: string[];
};

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function parseISO(d: string) {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ScheduleGrid({
  year,
  monthIndex,
  berths,
  reservations,
  conflictIds,
}: Props) {
  const router = useRouter();
  const days = daysInMonth(year, monthIndex);
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const conflictSet = useMemo(() => new Set(conflictIds), [conflictIds]);
  const [selected, setSelected] = useState<ScheduleReservation | null>(null);
  const [jump, setJump] = useState("");
  const [pending, startTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);

  const prev = () => {
    const d = new Date(Date.UTC(year, monthIndex - 1, 1));
    router.push(`/?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}`);
  };
  const next = () => {
    const d = new Date(Date.UTC(year, monthIndex + 1, 1));
    router.push(`/?year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}`);
  };

  const onJump = () => {
    const iso = isCompleteDate(jump) ? jump : normalizeDateInput(jump);
    if (!iso) return;
    const [y, m] = iso.split("-").map(Number);
    router.push(`/?year=${y}&month=${m}&focus=${iso}`);
  };

  return (
    <div className="space-y-6">
      {/* Asymmetric masthead: brand copy left, controls stacked right */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr] lg:items-end">
        <div className="lg:pr-8 lg:border-r-2 lg:border-ink">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Monthly dock schedule
          </p>
          <h1 className="font-display mt-2 text-4xl font-extrabold leading-[0.95] tracking-tight sm:text-5xl md:text-6xl">
            {MONTHS[monthIndex]}
            <span className="text-accent"> {year}</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted sm:text-base">
            Each row is a berth. Colored bars are bookings. Click a bar for
            details. Striped red means two bookings overlap on the same berth
            (often from the old spreadsheet).
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={prev} className="wm-btn">
              ← Previous month
            </button>
            <button type="button" onClick={next} className="wm-btn">
              Next month →
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:justify-end">
            <div className="min-w-[10rem]">
              <DateField
                label="Jump to date"
                value={jump}
                onChange={setJump}
                id="schedule-jump"
              />
            </div>
            <button type="button" onClick={onJump} className="wm-btn mb-0 self-end">
              Go to date
            </button>
          </div>
          <Link href="/reservations/new" className="wm-btn wm-btn-accent w-fit sm:self-end">
            New booking
          </Link>
        </div>
      </div>

      <div className="wm-panel overflow-auto">
        <div
          className="grid min-w-[900px]"
          style={{
            gridTemplateColumns: `200px repeat(${days}, minmax(26px, 1fr))`,
          }}
        >
          <div className="sticky left-0 z-10 border-b-2 border-r-2 border-ink bg-panel px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted">
            Berth / max length
          </div>
          {Array.from({ length: days }, (_, i) => (
            <div
              key={i}
              className="border-b-2 border-ink/15 px-0.5 py-2 text-center font-mono text-[10px] text-muted"
            >
              {i + 1}
            </div>
          ))}

          {berths.map((berth) => {
            const rowRes = reservations.filter((r) => r.berthId === berth.id);
            return (
              <BerthRow
                key={berth.id}
                berth={berth}
                days={days}
                monthStart={monthStart}
                reservations={rowRes}
                conflictSet={conflictSet}
                onSelect={setSelected}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 bg-accent" /> Vessel booking
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 bg-ink" /> Event or hold
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block h-3 w-5 border-2 border-accent"
            style={{
              background:
                "repeating-linear-gradient(45deg, #c81e3a, #c81e3a 2px, #faf8f4 2px, #faf8f4 5px)",
            }}
          />{" "}
          Overlap / conflict
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 border-2 border-dashed border-ink bg-panel" />{" "}
          From spreadsheet import
        </span>
      </div>

      {selected && (
        <Drawer
          reservation={selected}
          berths={berths}
          pending={pending}
          error={editError}
          onClose={() => {
            setSelected(null);
            setEditError(null);
          }}
          onDelete={() => {
            startTransition(async () => {
              const res = await deleteReservationAction(selected.id);
              if (!res.ok) setEditError(res.error);
              else {
                setSelected(null);
                router.refresh();
              }
            });
          }}
          onSave={(payload) => {
            startTransition(async () => {
              setEditError(null);
              const res = await updateReservationAction(payload);
              if (!res.ok) setEditError(res.error);
              else {
                setSelected(null);
                router.refresh();
              }
            });
          }}
        />
      )}
    </div>
  );
}

function BerthRow({
  berth,
  days,
  monthStart,
  reservations,
  conflictSet,
  onSelect,
}: {
  berth: ScheduleBerth;
  days: number;
  monthStart: Date;
  reservations: ScheduleReservation[];
  conflictSet: Set<string>;
  onSelect: (r: ScheduleReservation) => void;
}) {
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  );

  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r-2 border-ink/20 bg-paper px-3 py-2">
        <div className="text-sm font-semibold leading-tight">{berth.name}</div>
        <div className="font-mono text-[11px] text-muted">{berth.lengthFt}&apos; max</div>
      </div>
      <div
        className="relative border-b border-ink/15"
        style={{ gridColumn: `span ${days}` }}
      >
        <div
          className="grid h-11"
          style={{ gridTemplateColumns: `repeat(${days}, minmax(26px, 1fr))` }}
        >
          {Array.from({ length: days }, (_, i) => (
            <div key={i} className="border-r border-ink/8" />
          ))}
        </div>
        {reservations.map((r) => {
          const start = parseISO(r.startDate);
          const end = parseISO(r.endDate);
          const clippedStart = start < monthStart ? monthStart : start;
          const clippedEnd = end > monthEnd ? monthEnd : end;
          const startDay = clippedStart.getUTCDate();
          const endDay = clippedEnd.getUTCDate();
          const span = endDay - startDay + 1;
          if (span < 1) return null;
          const isConflict = conflictSet.has(r.id);
          const isEvent = r.kind === "EVENT";

          let color = "bg-accent text-paper";
          if (isEvent) color = "bg-ink text-paper";
          if (isConflict) {
            color = "text-ink border-2 border-accent";
          }

          const imported =
            r.source === "IMPORT" && !isConflict
              ? "opacity-90 outline outline-1 outline-dashed outline-offset-[-3px] outline-paper/80"
              : "";

          return (
            <button
              key={r.id}
              type="button"
              title={r.label}
              onClick={() => onSelect(r)}
              className={`absolute top-1.5 truncate px-1 text-left font-mono text-[10px] font-medium leading-7 ${color} ${imported}`}
              style={{
                left: `calc((100% / ${days}) * ${startDay - 1} + 1px)`,
                width: `calc((100% / ${days}) * ${span} - 2px)`,
                ...(isConflict
                  ? {
                      background:
                        "repeating-linear-gradient(45deg, #c81e3a, #c81e3a 3px, #faf8f4 3px, #faf8f4 7px)",
                    }
                  : {}),
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function Drawer({
  reservation,
  berths,
  pending,
  error,
  onClose,
  onDelete,
  onSave,
}: {
  reservation: ScheduleReservation;
  berths: ScheduleBerth[];
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onDelete: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const readOnly = reservation.source === "IMPORT";
  const [berthId, setBerthId] = useState(reservation.berthId);
  const [startDate, setStartDate] = useState(reservation.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(reservation.endDate.slice(0, 10));
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [eventName, setEventName] = useState(reservation.eventName ?? "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l-2 border-ink bg-paper p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-2 border-b-2 border-ink pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">
              {reservation.label}
            </h2>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-muted">
              {reservation.source === "IMPORT"
                ? "From spreadsheet import"
                : "Created in this app"}{" "}
              · {reservation.kind === "VESSEL" ? "Vessel" : "Event"}
              {reservation.vesselLengthFt != null
                ? ` · ${reservation.vesselLengthFt}'`
                : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} className="wm-btn px-2 py-1">
            Close
          </button>
        </div>

        {readOnly ? (
          <div className="space-y-4 text-sm">
            <p>
              <span className="wm-label">Dates</span>
              {reservation.startDate.slice(0, 10)} → {reservation.endDate.slice(0, 10)}
            </p>
            <p>
              <span className="wm-label">Berth</span>
              {berths.find((b) => b.id === reservation.berthId)?.name}
            </p>
            {reservation.notes && (
              <p className="border-2 border-ink bg-panel p-3 text-sm">{reservation.notes}</p>
            )}
            <p className="border-l-4 border-accent pl-3 text-sm text-muted">
              This booking came from the historical Excel import and cannot be
              edited here. If something looks wrong, see{" "}
              <Link href="/issues" className="wm-link">
                Import issues
              </Link>
              .
            </p>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              onSave({
                id: reservation.id,
                berthId,
                kind: reservation.kind,
                vesselId: reservation.vesselId,
                eventName: reservation.kind === "EVENT" ? eventName : null,
                startDate,
                endDate,
                notes,
              });
            }}
          >
            <label className="block">
              <span className="wm-label">Berth</span>
              <select
                value={berthId}
                onChange={(e) => setBerthId(e.target.value)}
                className="wm-select"
              >
                {berths.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.lengthFt}&apos;)
                  </option>
                ))}
              </select>
            </label>
            {reservation.kind === "EVENT" && (
              <label className="block">
                <span className="wm-label">Event name</span>
                <input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  className="wm-input"
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <DateField
                label="Start"
                value={startDate}
                onChange={setStartDate}
                required
              />
              <DateField
                label="End"
                value={endDate}
                onChange={setEndDate}
                min={isCompleteDate(startDate) ? startDate : undefined}
                required
              />
            </div>
            <label className="block">
              <span className="wm-label">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="wm-textarea"
              />
            </label>
            {error && (
              <p className="border-2 border-accent bg-panel px-3 py-2 text-sm text-accent">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <button type="submit" disabled={pending} className="wm-btn wm-btn-accent">
                Save changes
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={onDelete}
                className="wm-btn"
              >
                Delete booking
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
