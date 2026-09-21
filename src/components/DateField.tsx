"use client";

import { useEffect, useState } from "react";
import {
  isCompleteDate,
  isoToDisplay,
  normalizeDateInput,
} from "@/lib/dates";

function requestedDay(raw: string): number | null {
  const us = raw.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (us) return Number(us[2]);
  const iso = raw.trim().match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (iso) return Number(iso[3]);
  return null;
}

/**
 * Text date field that accepts M/D/YYYY (or ISO) and clamps impossible days
 * on blur (e.g. 2/31/2025 → 2/28/2025). Value is stored as YYYY-MM-DD.
 */
export function DateField({
  label,
  value,
  onChange,
  onNormalized,
  min,
  required,
  id,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  /** Called after blur when a complete date was accepted (clamped if needed). */
  onNormalized?: (iso: string) => void;
  min?: string;
  required?: boolean;
  id?: string;
}) {
  const [text, setText] = useState(() => (value ? isoToDisplay(value) : ""));
  const [hint, setHint] = useState<string | null>(null);
  const hintId = `${id ?? label.replace(/\s+/g, "-").toLowerCase()}-date-hint`;

  useEffect(() => {
    if (isCompleteDate(value)) {
      setText(isoToDisplay(value));
    } else if (!value) {
      setText("");
    }
  }, [value]);

  function commit(raw: string) {
    const normalized = normalizeDateInput(raw);
    if (!normalized) {
      if (raw.trim()) {
        setHint("Use a full date like 2/28/2025.");
      } else {
        setHint(null);
        onChange("");
      }
      return;
    }

    let next = normalized;
    let nextHint: string | null = null;

    const asked = requestedDay(raw);
    const clampedDay = Number(normalized.slice(8, 10));
    if (asked != null && asked > clampedDay) {
      nextHint = `No day ${asked} in that month — using ${isoToDisplay(normalized)}.`;
    }

    if (min && isCompleteDate(min) && next < min) {
      next = min;
      nextHint = `Adjusted to ${isoToDisplay(next)} (not before start).`;
    }

    setHint(nextHint);
    setText(isoToDisplay(next));
    onChange(next);
    onNormalized?.(next);
  }

  return (
    <label className="block">
      <span className="wm-label">{label}</span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="M/D/YYYY"
        required={required}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHint(null);
          const live = normalizeDateInput(e.target.value);
          if (live) onChange(live);
          else if (!e.target.value.trim()) onChange("");
        }}
        onBlur={(e) => commit(e.target.value)}
        className="wm-input"
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </label>
  );
}
