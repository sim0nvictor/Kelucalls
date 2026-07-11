"use client";

import { useState } from "react";

/**
 * DateRangePicker
 *
 * Client island that renders start/end date dropdowns.
 * Prevents selecting dates in the past.
 * Writes startsAt and endsAt as ISO strings into hidden inputs
 * so the parent server-action form reads them on submit.
 */

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const HOURS = Array.from({ length: 24 }, (_, i) =>
  i.toString().padStart(2, "0") + ":00"
);

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month + 1, 0).getDate();
}

function buildISO(year: number, month: number, day: number, hour: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  return `${year}-${m}-${d}T${h}:00:00`;
}

function DatePicker({
  label,
  value,
  onChange,
  minDate,
}: {
  label: string;
  value: { year: number; month: number; day: number; hour: number } | null;
  onChange: (v: { year: number; month: number; day: number; hour: number } | null) => void;
  minDate?: { year: number; month: number; day: number };
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const years = [currentYear, currentYear + 1, currentYear + 2];

  const selected = value ?? {
    year: currentYear,
    month: now.getMonth(),
    day: now.getDate(),
    hour: now.getHours() + 1,
  };

  const daysInMonth = getDaysInMonth(selected.month, selected.year);

  function update(patch: Partial<typeof selected>) {
    const next = { ...selected, ...patch };
    // Clamp day if month/year changed and day exceeds max
    const maxDay = getDaysInMonth(next.month, next.year);
    if (next.day > maxDay) next.day = maxDay;
    onChange(next);
  }

  function isDateBeforeMin(y: number, m: number, d: number) {
    if (!minDate) return false;
    if (y > minDate.year) return false;
    if (y < minDate.year) return true;
    if (m > minDate.month) return false;
    if (m < minDate.month) return true;
    return d < minDate.day;
  }

  const selectClass =
    "rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2.5 text-sm text-white focus:border-cyan-400/40 focus:outline-none";

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Month */}
        <select
          className={selectClass}
          value={selected.month}
          onChange={(e) => update({ month: Number(e.target.value) })}
        >
          {MONTHS.map((name, i) => {
            const isPast = isDateBeforeMin(selected.year, i, selected.day);
            return (
              <option key={i} value={i} disabled={isPast}>
                {name.slice(0, 3)}
              </option>
            );
          })}
        </select>

        {/* Day */}
        <select
          className={selectClass}
          value={selected.day}
          onChange={(e) => update({ day: Number(e.target.value) })}
        >
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const isPast = isDateBeforeMin(selected.year, selected.month, d);
            return (
              <option key={d} value={d} disabled={isPast}>
                {d}
              </option>
            );
          })}
        </select>

        {/* Year */}
        <select
          className={selectClass}
          value={selected.year}
          onChange={(e) => update({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {/* Hour */}
        <select
          className={selectClass}
          value={selected.hour}
          onChange={(e) => update({ hour: Number(e.target.value) })}
        >
          {HOURS.map((h, i) => (
            <option key={i} value={i}>{h}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function DateRangePicker() {
  const now = new Date();
  const todayMin = { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };

  const [start, setStart] = useState<{
    year: number; month: number; day: number; hour: number;
  } | null>(null);

  const [end, setEnd] = useState<{
    year: number; month: number; day: number; hour: number;
  } | null>(null);

  const [noEndDate, setNoEndDate] = useState(false);

  const startISO = start ? buildISO(start.year, start.month, start.day, start.hour) : "";
  const endISO   = end && !noEndDate ? buildISO(end.year, end.month, end.day, end.hour) : "";

  // Min for end date = start date (can't end before it starts)
  const endMin = start
    ? { year: start.year, month: start.month, day: start.day }
    : todayMin;

  return (
    <div className="space-y-4">
      {/* Hidden inputs the server action reads */}
      <input type="hidden" name="startsAt" value={startISO} />
      <input type="hidden" name="endsAt"   value={endISO} />

      <DatePicker
        label="Start date"
        value={start}
        onChange={setStart}
        minDate={todayMin}
      />

      {!noEndDate && (
        <DatePicker
          label="End date (optional)"
          value={end}
          onChange={setEnd}
          minDate={endMin}
        />
      )}

      <label className="flex items-center gap-2.5 text-sm text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          className="size-4 rounded"
          checked={noEndDate}
          onChange={(e) => {
            setNoEndDate(e.target.checked);
            if (e.target.checked) setEnd(null);
          }}
        />
        No end date (runs indefinitely)
      </label>
    </div>
  );
}