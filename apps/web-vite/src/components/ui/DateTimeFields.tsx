// Human: Split date/time text inputs with keyboard nudging, strict parsing to reject impossible calendar values, and controlled sync from the parent `value` when not actively editing.
// Agent: STATE isEditing gates value→parts sync; CALLS onChange with fromParts or null; HTTP none; READS idPrefix for element ids.
import React from "react";

interface DateTimeFieldsProps {
  label: string;
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  required?: boolean;
  error?: string;
  idPrefix: string;
}

function toParts(value: Date | null | undefined): {
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
} {
  if (!value || Number.isNaN(value.getTime())) {
    return { day: "", month: "", year: "", hour: "", minute: "" };
  }
  return {
    day: String(value.getDate()).padStart(2, "0"),
    month: String(value.getMonth() + 1).padStart(2, "0"),
    year: String(value.getFullYear()),
    hour: String(value.getHours()).padStart(2, "0"),
    minute: String(value.getMinutes()).padStart(2, "0"),
  };
}

// Human: Builds a local `Date` from parts and rejects rollover cases (for example 31 February) by comparing round-tripped fields.
// Agent: RETURNS Date|null; VALIDATES integer parts; COMPARES parsed vs input y/m/d/h/m.
function fromParts(day: string, month: string, year: string, hour: string, minute: string): Date | null {
  if (!day || !month || !year || !hour || !minute) return null;
  const dd = Number(day);
  const mm = Number(month);
  const yyyy = Number(year);
  const hh = Number(hour);
  const min = Number(minute);
  if (
    !Number.isInteger(dd) ||
    !Number.isInteger(mm) ||
    !Number.isInteger(yyyy) ||
    !Number.isInteger(hh) ||
    !Number.isInteger(min)
  ) {
    return null;
  }
  const parsed = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
  if (
    parsed.getFullYear() !== yyyy ||
    parsed.getMonth() + 1 !== mm ||
    parsed.getDate() !== dd ||
    parsed.getHours() !== hh ||
    parsed.getMinutes() !== min
  ) {
    return null;
  }
  return parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function DateTimeFields({
  label,
  value,
  onChange,
  required = false,
  error,
  idPrefix,
}: DateTimeFieldsProps) {
  const [day, setDay] = React.useState("");
  const [month, setMonth] = React.useState("");
  const [year, setYear] = React.useState("");
  const [hour, setHour] = React.useState("");
  const [minute, setMinute] = React.useState("");
  const [isEditing, setIsEditing] = React.useState(false);

  React.useEffect(() => {
    if (isEditing) return;
    const next = toParts(value ?? null);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
    setHour(next.hour);
    setMinute(next.minute);
  }, [isEditing, value]);

  const emit = (
    nextDay: string,
    nextMonth: string,
    nextYear: string,
    nextHour: string,
    nextMinute: string
  ) => {
    onChange(fromParts(nextDay, nextMonth, nextYear, nextHour, nextMinute));
  };

  const handleArrowDate = (deltaDays: number) => {
    const base = fromParts(day, month, year, hour || "00", minute || "00");
    if (!base) return;
    base.setDate(base.getDate() + deltaDays);
    const next = toParts(base);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
    emit(next.day, next.month, next.year, hour, minute);
  };

  const handleDayKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    handleArrowDate(e.key === "ArrowUp" ? 1 : -1);
  };

  const handleMonthKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const base = fromParts(day, month, year, hour || "00", minute || "00");
    if (!base) return;
    base.setMonth(base.getMonth() + (e.key === "ArrowUp" ? 1 : -1));
    const next = toParts(base);
    setDay(next.day);
    setMonth(next.month);
    setYear(next.year);
    emit(next.day, next.month, next.year, hour, minute);
  };

  const handleYearKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const nextYearNum = (Number(year) || new Date().getFullYear()) + (e.key === "ArrowUp" ? 1 : -1);
    const nextYear = String(nextYearNum).slice(0, 4);
    setYear(nextYear);
    emit(day, month, nextYear, hour, minute);
  };

  const handleHourKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const current = Number(hour || "0");
    const next = (current + (e.key === "ArrowUp" ? 1 : 23)) % 24;
    const nextHour = pad2(next);
    setHour(nextHour);
    emit(day, month, year, nextHour, minute);
  };

  const handleMinuteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const current = Number(minute || "0");
    const next = (current + (e.key === "ArrowUp" ? 1 : 59)) % 60;
    const nextMinute = pad2(next);
    setMinute(nextMinute);
    emit(day, month, year, hour, nextMinute);
  };

  return (
    <div>
      <label
        htmlFor={`${idPrefix}-date`}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
      >
        {label}
      </label>
      <div className="inline-flex w-fit px-2.5 py-2 rounded-xl border border-neutral-200/80 dark:border-neutral-700/70 bg-gradient-to-b from-white to-neutral-50/80 dark:from-neutral-900 dark:to-neutral-900/80 text-neutral-900 dark:text-neutral-100 items-center gap-1 shadow-soft hover:shadow-soft-md focus-within:border-primary-500/70 dark:focus-within:border-primary-400/70 focus-within:shadow-[0_0_0_3px_rgba(59,130,246,0.15)] transition-all duration-200">
        <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mr-1">
          Date
        </span>
        <input
          id={`${idPrefix}-day`}
          type="text"
          value={day}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setDay(v);
            emit(v, month, year, hour, minute);
          }}
          required={required}
          inputMode="numeric"
          placeholder="TT"
          onKeyDown={handleDayKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
        <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
        <input
          id={`${idPrefix}-month`}
          type="text"
          value={month}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setMonth(v);
            emit(day, v, year, hour, minute);
          }}
          required={required}
          inputMode="numeric"
          placeholder="MM"
          onKeyDown={handleMonthKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
        <span className="text-neutral-400 dark:text-neutral-500 text-sm">.</span>
        <input
          id={`${idPrefix}-year`}
          type="text"
          value={year}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYear(v);
            emit(day, month, v, hour, minute);
          }}
          required={required}
          inputMode="numeric"
          placeholder="JJJJ"
          onKeyDown={handleYearKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className="w-10 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
        <span className="mx-0.5 h-5 w-px bg-neutral-300 dark:bg-neutral-600" />
        <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 ml-0.5 mr-0.5">
          Time
        </span>
        <input
          id={`${idPrefix}-hour`}
          type="text"
          value={hour}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setHour(v);
            emit(day, month, year, v, minute);
          }}
          required={required}
          inputMode="numeric"
          placeholder="HH"
          onKeyDown={handleHourKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
        <span className="text-neutral-400 dark:text-neutral-500 text-sm">:</span>
        <input
          id={`${idPrefix}-minute`}
          type="text"
          value={minute}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            setMinute(v);
            emit(day, month, year, hour, v);
          }}
          required={required}
          inputMode="numeric"
          placeholder="MM"
          onKeyDown={handleMinuteKeyDown}
          onFocus={() => setIsEditing(true)}
          onBlur={() => setIsEditing(false)}
          className="w-7 bg-transparent text-center text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-error-600 dark:text-error-400">{error}</p>
      ) : null}
    </div>
  );
}
