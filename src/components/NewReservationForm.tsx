"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createReservationAction,
  createVesselAction,
  findAvailableBerths,
  updateVesselLengthAction,
  validateReservationPreview,
} from "@/lib/actions";
import { VESSEL_TYPE_PREFIXES } from "@/lib/scheduling";

type Berth = { id: string; name: string; lengthFt: number };
type Vessel = { id: string; name: string; lengthFt: number | null };

/** Only treat browser date values as real once year is plausible (avoids 0002 while typing). */
function isCompleteDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  return y >= 1900 && y <= 2100;
}

export function NewReservationForm({
  berths,
  vessels: initialVessels,
}: {
  berths: Berth[];
  vessels: Vessel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"VESSEL" | "EVENT">("VESSEL");
  const [berthId, setBerthId] = useState(berths[0]?.id ?? "");
  const [vesselId, setVesselId] = useState("");
  const [vesselQuery, setVesselQuery] = useState("");
  const [vessels, setVessels] = useState(initialVessels);
  const [loaInput, setLoaInput] = useState("");
  const [eventName, setEventName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fitMessage, setFitMessage] = useState("");
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [available, setAvailable] = useState<
    { id: string; name: string; lengthFt: number; fitMessage: string }[] | null
  >(null);

  const [showNewVessel, setShowNewVessel] = useState(false);
  const [newVesselName, setNewVesselName] = useState("");
  const [newVesselPrefix, setNewVesselPrefix] = useState("R/V");
  const [newVesselLength, setNewVesselLength] = useState("");
  const [newVesselOperator, setNewVesselOperator] = useState("");

  const selectedVessel = useMemo(
    () => vessels.find((v) => v.id === vesselId) ?? null,
    [vessels, vesselId],
  );

  const loaFt = useMemo(() => {
    const n = Number(loaInput);
    return loaInput.trim() && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }, [loaInput]);

  const filteredVessels = useMemo(() => {
    const q = vesselQuery.trim().toLowerCase();
    if (!q) return vessels.slice(0, 40);
    return vessels.filter((v) => v.name.toLowerCase().includes(q)).slice(0, 40);
  }, [vessels, vesselQuery]);

  const datesReady = isCompleteDate(startDate) && isCompleteDate(endDate);
  const canScan = Boolean(vesselId && datesReady && !pending);

  useEffect(() => {
    if (!berthId || !datesReady) {
      setFitMessage("");
      setConflictMessage(null);
      return;
    }
    if (kind === "VESSEL" && !vesselId) {
      setFitMessage("Pick a vessel first.");
      setConflictMessage(null);
      return;
    }
    const t = setTimeout(() => {
      void validateReservationPreview({
        berthId,
        kind,
        vesselId,
        vesselLengthFt: kind === "VESSEL" ? loaFt : null,
        startDate,
        endDate,
      }).then((r) => {
        setFitMessage(r.fitMessage);
        setConflictMessage(r.conflictMessage);
      });
    }, 200);
    return () => clearTimeout(t);
  }, [berthId, kind, vesselId, startDate, endDate, loaFt, datesReady]);

  function selectVessel(id: string) {
    setVesselId(id);
    const v = vessels.find((x) => x.id === id);
    setLoaInput(v?.lengthFt != null ? String(v.lengthFt) : "");
  }

  /** After first day is fully set, default last day to the same day if empty / before start. */
  function syncEndFromStart(nextStart: string) {
    if (!isCompleteDate(nextStart)) return;
    if (!isCompleteDate(endDate) || endDate < nextStart) {
      setEndDate(nextStart);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Dock assignment
        </p>
        <h1 className="font-display mt-2 text-4xl font-extrabold leading-none sm:text-5xl">
          Put a hull
          <span className="text-accent"> on the pier</span>
        </h1>
        <p className="mt-4 max-w-sm text-sm text-muted">
          We check LOA against the berth and whether another vessel or hold already
          owns those days, including the historical dock ledger. Missing LOA? Enter
          it below before you make fast.
        </p>

        {kind === "VESSEL" && (
          <div className="mt-8 border-2 border-ink bg-panel p-4 lg:mt-12">
            <h2 className="font-display text-xl font-bold">Open water at the pier</h2>
            <p className="mt-1 text-sm text-muted">
              Needs a vessel, LOA, and both dates. Lists floats and faces that fit
              and are clear.
            </p>
            <button
              type="button"
              className="wm-btn mt-3"
              disabled={!canScan || loaFt == null}
              title={
                !vesselId
                  ? "Pick a vessel first"
                  : loaFt == null
                    ? "Enter LOA first"
                    : !datesReady
                      ? "Enter complete first and last days"
                      : undefined
              }
              onClick={() => {
                startTransition(async () => {
                  const res = await findAvailableBerths({
                    vesselId,
                    startDate,
                    endDate,
                    vesselLengthFt: loaFt,
                  });
                  if (!res.ok) setError(res.error);
                  else setAvailable(res.data?.berths ?? []);
                });
              }}
            >
              Scan the harbor
            </button>
            {!canScan && (
              <p className="mt-2 font-mono text-[11px] text-muted">
                {!vesselId
                  ? "Waiting on vessel…"
                  : !datesReady
                    ? "Waiting on complete dates…"
                    : null}
              </p>
            )}
            {available && (
              <ul className="mt-3 space-y-2 text-sm">
                {available.length === 0 ? (
                  <li className="text-muted">No clear berth for those dates.</li>
                ) : (
                  available.map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-2 border-b border-ink/15 pb-2"
                    >
                      <span>
                        {b.name} ({b.lengthFt}&apos;) - {b.fitMessage}
                      </span>
                      <button
                        type="button"
                        className="wm-link text-sm"
                        onClick={() => setBerthId(b.id)}
                      >
                        Use this
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        )}
      </div>

      <form
        className="wm-panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!isCompleteDate(startDate) || !isCompleteDate(endDate)) {
            setError("Enter complete first and last days (use the calendar or full YYYY-MM-DD).");
            return;
          }
          if (kind === "VESSEL" && loaFt == null) {
            setError("Enter this vessel’s LOA in feet before booking.");
            return;
          }
          startTransition(async () => {
            const res = await createReservationAction({
              berthId,
              kind,
              vesselId: kind === "VESSEL" ? vesselId : null,
              vesselLengthFt: kind === "VESSEL" ? loaFt : null,
              eventName: kind === "EVENT" ? eventName : null,
              startDate,
              endDate,
              notes,
            });
            if (!res.ok) setError(res.error);
            else {
              if (kind === "VESSEL" && vesselId && loaFt != null) {
                setVessels((list) =>
                  list.map((v) => (v.id === vesselId ? { ...v, lengthFt: loaFt } : v)),
                );
              }
              router.push(
                `/?year=${startDate.slice(0, 4)}&month=${Number(startDate.slice(5, 7))}`,
              );
            }
          });
        }}
      >
        <div className="flex border-2 border-ink">
          {(["VESSEL", "EVENT"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex-1 px-3 py-2 text-sm font-semibold ${
                kind === k ? "bg-accent text-paper" : "bg-paper hover:bg-panel"
              }`}
            >
              {k === "VESSEL" ? "Vessel" : "Event / hold"}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="wm-label">Berth</span>
          <select
            required
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

        {kind === "VESSEL" ? (
          <div className="space-y-2">
            <label className="block">
              <span className="wm-label">Vessel</span>
              <input
                value={vesselQuery}
                onChange={(e) => setVesselQuery(e.target.value)}
                placeholder="Type part of the name…"
                className="wm-input"
              />
            </label>
            <select
              required
              value={vesselId}
              onChange={(e) => selectVessel(e.target.value)}
              className="wm-select font-mono text-sm"
              size={6}
            >
              <option value="">(pick one)</option>
              {filteredVessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.lengthFt != null ? ` (${v.lengthFt}')` : " (no LOA yet)"}
                </option>
              ))}
            </select>

            {vesselId && (
              <div className="border-2 border-ink bg-panel p-3">
                <label className="block">
                  <span className="wm-label">
                    LOA (ft)
                    {selectedVessel?.lengthFt == null
                      ? " - required for this vessel"
                      : " - editable"}
                  </span>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      required
                      value={loaInput}
                      onChange={(e) => setLoaInput(e.target.value)}
                      placeholder="e.g. 72"
                      className="wm-input"
                    />
                    {selectedVessel?.lengthFt == null ||
                    (loaFt != null && loaFt !== selectedVessel.lengthFt) ? (
                      <button
                        type="button"
                        className="wm-btn shrink-0"
                        disabled={pending || loaFt == null}
                        onClick={() => {
                          startTransition(async () => {
                            const res = await updateVesselLengthAction({
                              vesselId,
                              lengthFt: loaFt,
                            });
                            if (!res.ok) setError(res.error);
                            else if (res.data) {
                              setVessels((list) =>
                                list.map((v) =>
                                  v.id === vesselId
                                    ? { ...v, lengthFt: res.data!.lengthFt }
                                    : v,
                                ),
                              );
                            }
                          });
                        }}
                      >
                        Save LOA
                      </button>
                    ) : null}
                  </div>
                </label>
                <p className="mt-2 text-xs text-muted">
                  Saved onto the vessel record so future bookings remember it.
                </p>
              </div>
            )}

            <button
              type="button"
              className="wm-link text-sm"
              onClick={() => setShowNewVessel((s) => !s)}
            >
              {showNewVessel ? "Cancel new vessel" : "Vessel isn’t in the list - add it"}
            </button>
            {showNewVessel && (
              <div className="space-y-2 border-2 border-ink bg-panel p-3">
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={newVesselPrefix}
                    onChange={(e) => setNewVesselPrefix(e.target.value)}
                    className="wm-select"
                  >
                    {VESSEL_TYPE_PREFIXES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Name"
                    value={newVesselName}
                    onChange={(e) => setNewVesselName(e.target.value)}
                    className="wm-input col-span-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Length (ft)"
                    value={newVesselLength}
                    onChange={(e) => setNewVesselLength(e.target.value)}
                    className="wm-input"
                  />
                  <input
                    placeholder="Operator"
                    value={newVesselOperator}
                    onChange={(e) => setNewVesselOperator(e.target.value)}
                    className="wm-input"
                  />
                </div>
                <button
                  type="button"
                  className="wm-btn wm-btn-accent"
                  onClick={() => {
                    startTransition(async () => {
                      const res = await createVesselAction({
                        name: newVesselName,
                        typePrefix: newVesselPrefix,
                        lengthFt: newVesselLength ? Number(newVesselLength) : null,
                        operator: newVesselOperator || null,
                      });
                      if (!res.ok) setError(res.error);
                      else if (res.data) {
                        setVessels((v) => [...v, res.data!]);
                        setVesselId(res.data.id);
                        setVesselQuery(res.data.name);
                        setLoaInput(
                          res.data.lengthFt != null ? String(res.data.lengthFt) : "",
                        );
                        setShowNewVessel(false);
                      }
                    });
                  }}
                >
                  Save vessel
                </button>
              </div>
            )}
          </div>
        ) : (
          <label className="block">
            <span className="wm-label">What is this hold for?</span>
            <input
              required
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="e.g. Community sail day"
              className="wm-input"
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="wm-label">First day</span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                // Do NOT copy mid-typing values into last day (that caused year 0002).
              }}
              onBlur={(e) => syncEndFromStart(e.target.value)}
              className="wm-input"
            />
          </label>
          <label className="block">
            <span className="wm-label">Last day</span>
            <input
              type="date"
              required
              value={endDate}
              min={isCompleteDate(startDate) ? startDate : undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="wm-input"
            />
          </label>
        </div>
        <p className="font-mono text-[11px] text-muted">
          Tip: pick dates from the calendar popup, or finish the full date before
          leaving the first field. Last day defaults to first day when you leave
          that field.
        </p>

        <label className="block">
          <span className="wm-label">Notes for the dock crew</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="wm-textarea"
          />
        </label>

        <div className="border-2 border-ink bg-panel px-3 py-2 text-sm">
          {fitMessage && <p>{fitMessage}</p>}
          {conflictMessage && (
            <p className="mt-1 font-semibold text-accent">{conflictMessage}</p>
          )}
          {!conflictMessage &&
            fitMessage &&
            !fitMessage.toLowerCase().includes("unknown") &&
            !fitMessage.toLowerCase().includes("too long") &&
            !fitMessage.toLowerCase().includes("pick a vessel") && (
              <p className="mt-1 font-semibold">Clear - nothing else on that berth.</p>
            )}
        </div>

        {error && (
          <p className="border-2 border-accent px-3 py-2 text-sm text-accent">{error}</p>
        )}

        <button type="submit" disabled={pending} className="wm-btn wm-btn-accent w-full">
          {pending ? "Making fast…" : "Make fast"}
        </button>
      </form>
    </div>
  );
}
