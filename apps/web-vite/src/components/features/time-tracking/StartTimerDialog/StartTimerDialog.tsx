import React from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/api/client";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";
import { TagAutocompleteInput } from "@/components/ui/TagAutocompleteInput";

const formatEuropeanDateTime = (value: Date): string => {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const year = value.getFullYear();
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

const MONTH_LABELS = [
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

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const isSameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const addMinutes = (date: Date, minutes: number): Date => new Date(date.getTime() + minutes * 60000);

const withTime = (date: Date, hours: number, minutes: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);

const buildCalendarDays = (month: Date): Date[] => {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayBasedOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - mondayBasedOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
};

const to12Hour = (hour24: number): number => {
  const normalized = hour24 % 12;
  return normalized === 0 ? 12 : normalized;
};

const to24Hour = (hour12: number, meridiem: "AM" | "PM"): number => {
  if (meridiem === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
};

/** Strip time for stable date when applying clock selection (matches iOS date+time flow). */
const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Every 5 minutes we show a larger tick + numeric label; other minutes use a small dot. */
const MINUTE_LABEL_VALUES = Array.from({ length: 12 }, (_, i) => i * 5);

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function StartTimerDialog({ open, onOpenChange, onCreated }: StartTimerDialogProps) {
  const pickerTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const clockDialRef = React.useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = React.useRef<number | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [startedAt, setStartedAt] = React.useState<Date | null>(null);
  const [startedAtInput, setStartedAtInput] = React.useState("");
  const [isDateTimePickerOpen, setIsDateTimePickerOpen] = React.useState(false);
  const [pickerStep, setPickerStep] = React.useState<"date" | "time">("date");
  const [timeDialMode, setTimeDialMode] = React.useState<"hour" | "minute">("hour");
  const [visibleMonth, setVisibleMonth] = React.useState(() => new Date());
  const [draftDateTime, setDraftDateTime] = React.useState(() => new Date());
  const [clockHour, setClockHour] = React.useState<number>(12);
  const [clockMinute, setClockMinute] = React.useState<number>(0);
  const [clockMeridiem, setClockMeridiem] = React.useState<"AM" | "PM">("AM");
  const [pickerPosition, setPickerPosition] = React.useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
      setLocation("");
      setStartedAt(null);
      setTags([]);
      setTagInput("");
      setServerError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && !startedAt) {
      setStartedAt(new Date());
    }
  }, [open, startedAt]);

  React.useEffect(() => {
    if (!startedAt || isNaN(startedAt.getTime())) {
      setStartedAtInput("");
      return;
    }
    setStartedAtInput(formatEuropeanDateTime(startedAt));
  }, [startedAt]);

  React.useEffect(() => {
    if (!isDateTimePickerOpen) return;
    const source = startedAt || new Date();
    setDraftDateTime(source);
    setVisibleMonth(new Date(source.getFullYear(), source.getMonth(), 1));
    setPickerStep("date");
    setTimeDialMode("hour");
    setClockHour(to12Hour(source.getHours()));
    setClockMinute(source.getMinutes());
    setClockMeridiem(source.getHours() >= 12 ? "PM" : "AM");
  }, [isDateTimePickerOpen, startedAt]);

  React.useEffect(() => {
    if (!isDateTimePickerOpen) return;

    const updatePickerPosition = () => {
      if (!pickerTriggerRef.current) return;
      const rect = pickerTriggerRef.current.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const estimatedPanelHeight = 430;
      const preferredWidth = Math.min(340, Math.max(280, rect.width));
      const left = Math.max(margin, Math.min(rect.left, window.innerWidth - preferredWidth - margin));
      const availableBelow = window.innerHeight - rect.bottom - margin;
      const availableAbove = rect.top - margin;
      const placeBelow = availableBelow >= estimatedPanelHeight || availableBelow >= availableAbove;
      const maxHeight = Math.max(220, placeBelow ? availableBelow : availableAbove);
      const top = placeBelow
        ? rect.bottom + gap
        : Math.max(margin, rect.top - Math.min(estimatedPanelHeight, maxHeight) - gap);
      setPickerPosition({
        top,
        left,
        width: preferredWidth,
        maxHeight,
      });
    };

    updatePickerPosition();
    window.addEventListener("resize", updatePickerPosition);
    window.addEventListener("scroll", updatePickerPosition, true);
    return () => {
      window.removeEventListener("resize", updatePickerPosition);
      window.removeEventListener("scroll", updatePickerPosition, true);
    };
  }, [isDateTimePickerOpen]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const draftDateTimeRef = React.useRef(draftDateTime);
  const clockHourRef = React.useRef(clockHour);
  const clockMeridiemRef = React.useRef(clockMeridiem);
  const timeDialModeRef = React.useRef(timeDialMode);
  const clockMinuteRef = React.useRef(clockMinute);
  draftDateTimeRef.current = draftDateTime;
  clockHourRef.current = clockHour;
  clockMeridiemRef.current = clockMeridiem;
  timeDialModeRef.current = timeDialMode;
  clockMinuteRef.current = clockMinute;

  const commitTimeSelection = React.useCallback((minute: number) => {
    const next = withTime(
      startOfDay(draftDateTimeRef.current),
      to24Hour(clockHourRef.current, clockMeridiemRef.current),
      minute
    );
    setStartedAt(next);
    setStartedAtInput(formatEuropeanDateTime(next));
    setServerError(null);
    setIsDateTimePickerOpen(false);
  }, []);

  const updateDialFromPointer = React.useCallback((clientX: number, clientY: number) => {
    if (!clockDialRef.current) return;
    const rect = clockDialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const minRadius = Math.min(rect.width, rect.height) * 0.08;
    if (dist < minRadius) return;

    // Convert to clockwise angle from 12 o'clock.
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;

    if (timeDialModeRef.current === "hour") {
      // hourIndex matches label idx (0..11 → numbers 1..12 on the dial); do not map 0→12.
      const hourIndex = Math.round(angle / (Math.PI * 2 / 12)) % 12;
      const hourValue = hourIndex + 1;
      setClockHour(hourValue);
      return;
    }

    const minuteValue = Math.round(angle / (Math.PI * 2 / 60)) % 60;
    setClockMinute(minuteValue);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setIsSubmitting(true);

    try {
      await api.post("/time-tracking", {
        name: name.trim() || undefined,
        description: description || undefined,
        tags: tags.length > 0 ? tags : undefined,
        location: location.trim() || undefined,
        started_at: startedAt?.toISOString(),
      });
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      setServerError(error.message || "Failed to start timer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      description="Create a new time tracking entry"
    >
      <form onSubmit={onSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {serverError && (
          <div className="p-4 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
            <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
          </div>
        )}

        <Input
          label="Name"
          placeholder="Enter timer name (optional)"
          helperText="Leave empty to auto-generate a timer number (e.g., #TMR-000001)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Textarea
          label="Description"
          placeholder="Optional description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div>
          <label htmlFor="start-timer-start-time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Start Time
          </label>
          <div className="relative">
            <button
              id="start-timer-start-time"
              ref={pickerTriggerRef}
              type="button"
              onClick={() => setIsDateTimePickerOpen((prev) => !prev)}
              className="w-full flex items-center justify-between px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-left text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <span className={startedAtInput ? "" : "text-neutral-500 dark:text-neutral-400"}>
                {startedAtInput || "dd.mm.yyyy HH:mm"}
              </span>
              <svg className="w-5 h-5 text-neutral-500 dark:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>

            {isDateTimePickerOpen && (
              <div className="fixed inset-0 z-[80]" onClick={() => setIsDateTimePickerOpen(false)}>
              <div
                className="fixed z-[90] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 shadow-xl backdrop-blur-md p-3 space-y-3"
                style={{
                  top: pickerPosition?.top ?? 0,
                  left: pickerPosition?.left ?? 0,
                  width: pickerPosition?.width ?? 320,
                  maxHeight: pickerPosition?.maxHeight ?? 430,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="overflow-y-auto max-h-full pr-1 space-y-3">
                <div className="flex items-center gap-2 rounded-full bg-neutral-100 dark:bg-neutral-800 p-1">
                  <button
                    type="button"
                    onClick={() => setPickerStep("date")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition ${
                      pickerStep === "date"
                        ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow"
                        : "text-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    1. Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerStep("time")}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-full transition ${
                      pickerStep === "time"
                        ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow"
                        : "text-neutral-600 dark:text-neutral-300"
                    }`}
                  >
                    2. Time
                  </button>
                </div>

                <div className="relative min-h-[260px] overflow-hidden">
                  <div
                    className={`space-y-3 transition-all duration-300 ease-out ${
                      pickerStep === "date"
                        ? "translate-x-0 opacity-100"
                        : "-translate-x-6 opacity-0 pointer-events-none absolute inset-0"
                    }`}
                  >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    aria-label="Previous month"
                  >
                    {"<"}
                  </button>
                  <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    {MONTH_LABELS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    className="w-8 h-8 rounded-full border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    aria-label="Next month"
                  >
                    {">"}
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="text-center text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 py-1">
                      {label}
                    </div>
                  ))}
                  {buildCalendarDays(visibleMonth).map((day) => {
                    const inMonth = day.getMonth() === visibleMonth.getMonth();
                    const selected = isSameDay(day, draftDateTime);
                    const today = isSameDay(day, new Date());
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        onClick={() =>
                          setDraftDateTime((prev) => {
                            setPickerStep("time");
                            return withTime(day, prev.getHours(), prev.getMinutes());
                          })
                        }
                        className={[
                          "h-8 rounded-md text-xs transition-colors",
                          selected
                            ? "bg-primary-600 text-white shadow"
                            : inMonth
                              ? "text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                              : "text-neutral-400 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                          today && !selected ? "ring-1 ring-primary-400" : "",
                        ].join(" ")}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
                  </div>
                  <div
                    className={`space-y-3 transition-all duration-300 ease-out ${
                      pickerStep === "time"
                        ? "translate-x-0 opacity-100"
                        : "translate-x-6 opacity-0 pointer-events-none absolute inset-0"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2 rounded-full bg-neutral-100/90 dark:bg-neutral-800/90 p-1 border border-neutral-200/80 dark:border-neutral-700/80">
                      {(["AM", "PM"] as const).map((meridiem) => (
                        <button
                          key={meridiem}
                          type="button"
                          onClick={() => setClockMeridiem(meridiem)}
                          className={`flex-1 max-w-[88px] py-1.5 rounded-full text-xs font-semibold transition ${
                            clockMeridiem === meridiem
                              ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                              : "text-neutral-600 dark:text-neutral-400"
                          }`}
                        >
                          {meridiem}
                        </button>
                      ))}
                    </div>

                    <p className="text-center text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      {timeDialMode === "hour"
                        ? "Drag or tap the dial to choose hour"
                        : "Drag the dial for exact minutes, release to apply"}
                    </p>

                    <div
                      ref={clockDialRef}
                      className="mx-auto relative w-52 h-52 rounded-full bg-gradient-to-b from-neutral-100 to-neutral-200/90 dark:from-neutral-700 dark:to-neutral-800 border border-neutral-300/80 dark:border-neutral-600 shadow-[inset_0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_2px_12px_rgba(0,0,0,0.25)]"
                    >
                      {/* Analog hand — iOS-style pointer from center */}
                      {(() => {
                        /* Hour dots at idx*30° from top; minutes use 6° per minute. */
                        const handDeg =
                          timeDialMode === "hour"
                            ? (clockHour - 1) * 30
                            : clockMinute * 6;
                        return (
                          <div
                            className="absolute left-1/2 top-1/2 z-[16] w-1 h-[38%] -mt-[38%] rounded-full bg-primary-600 dark:bg-primary-500 shadow-sm origin-bottom pointer-events-none transition-transform duration-200 ease-out"
                            style={{
                              transform: `translateX(-50%) rotate(${handDeg}deg)`,
                            }}
                          />
                        );
                      })()}
                      <div className="absolute left-1/2 top-1/2 z-[26] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-600 dark:bg-primary-500 border-2 border-white dark:border-neutral-900 shadow pointer-events-none" />

                      {/* Minute mode: 60 accurate tick positions (small dots + 5‑min majors + labels). */}
                      {timeDialMode === "minute" &&
                        Array.from({ length: 60 }, (_, m) => {
                          const angle = (m / 60) * Math.PI * 2 - Math.PI / 2;
                          const rPct = 42.5;
                          const x = 50 + Math.cos(angle) * rPct;
                          const y = 50 + Math.sin(angle) * rPct;
                          const isMajor = m % 5 === 0;
                          const isSelected = clockMinute === m;
                          return (
                            <span
                              key={`min-dot-${m}`}
                              aria-hidden
                              className={`absolute z-[10] -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none transition-colors duration-150 ${
                                isMajor
                                  ? isSelected
                                    ? "h-2 w-2 bg-primary-600 dark:bg-primary-400 ring-2 ring-primary-300/60 dark:ring-primary-600/50"
                                    : "h-2 w-2 bg-neutral-600 dark:bg-neutral-300"
                                  : isSelected
                                    ? "h-1.5 w-1.5 bg-primary-500 dark:bg-primary-400"
                                    : "h-[2.5px] w-[2.5px] min-h-[2.5px] min-w-[2.5px] bg-neutral-400/95 dark:bg-neutral-500/95"
                              }`}
                              style={{ left: `${x}%`, top: `${y}%` }}
                            />
                          );
                        })}

                      {timeDialMode === "minute" &&
                        MINUTE_LABEL_VALUES.map((value) => {
                          const angle = (value / 60) * Math.PI * 2 - Math.PI / 2;
                          const rLabel = 30;
                          const x = 50 + Math.cos(angle) * rLabel;
                          const y = 50 + Math.sin(angle) * rLabel;
                          const isSelected = clockMinute === value;
                          return (
                            <span
                              key={`min-lbl-${value}`}
                              aria-hidden
                              className={`absolute z-[12] flex h-5 min-w-[1.25rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded text-[9px] font-bold tabular-nums pointer-events-none select-none transition-colors duration-150 ${
                                isSelected
                                  ? "text-primary-700 dark:text-primary-300"
                                  : "text-neutral-500 dark:text-neutral-400"
                              }`}
                              style={{ left: `${x}%`, top: `${y}%` }}
                            >
                              {String(value).padStart(2, "0")}
                            </span>
                          );
                        })}

                      {timeDialMode === "minute" && (
                        <div
                          className="pointer-events-none absolute left-1/2 top-[20%] z-[25] w-[88%] -translate-x-1/2 text-center"
                          aria-live="polite"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                            {clockMeridiem}
                          </div>
                          <div className="text-xl font-bold tabular-nums leading-tight text-neutral-900 dark:text-neutral-50">
                            {clockHour}
                            <span className="mx-0.5 text-neutral-400 dark:text-neutral-500 font-semibold">:</span>
                            {String(clockMinute).padStart(2, "0")}
                          </div>
                          <div className="mt-0.5 text-[9px] font-medium text-neutral-500 dark:text-neutral-400">
                            Precise to the minute — drag the ring
                          </div>
                        </div>
                      )}

                      {/* Hour labels — visual only; drag layer on top (z-40). */}
                      {timeDialMode === "hour" &&
                        Array.from({ length: 12 }, (_, i) => i + 1).map((value, idx) => {
                          const angle = (idx / 12) * Math.PI * 2 - Math.PI / 2;
                          const x = 50 + Math.cos(angle) * 40;
                          const y = 50 + Math.sin(angle) * 40;
                          const selected = clockHour === value;
                          return (
                            <span
                              key={`hour-${value}`}
                              aria-hidden
                              className={`absolute z-[15] flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-semibold pointer-events-none select-none transition-all duration-150 ${
                                selected
                                  ? "bg-primary-600 text-white shadow-md scale-110"
                                  : "text-neutral-800 dark:text-neutral-100"
                              }`}
                              style={{ left: `${x}%`, top: `${y}%` }}
                            >
                              {value}
                            </span>
                          );
                        })}

                      <div
                        className="absolute inset-0 z-[40] rounded-full touch-none cursor-grab active:cursor-grabbing"
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => {
                          if (e.button !== 0 && e.pointerType === "mouse") return;
                          activePointerIdRef.current = e.pointerId;
                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch {
                            /* ignore */
                          }
                          updateDialFromPointer(e.clientX, e.clientY);
                        }}
                        onPointerMove={(e) => {
                          if (activePointerIdRef.current !== e.pointerId) return;
                          updateDialFromPointer(e.clientX, e.clientY);
                        }}
                        onPointerUp={(e) => {
                          if (activePointerIdRef.current !== e.pointerId) return;
                          try {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          } catch {
                            /* ignore */
                          }
                          activePointerIdRef.current = null;
                          updateDialFromPointer(e.clientX, e.clientY);
                          if (timeDialModeRef.current === "hour") {
                            setTimeDialMode("minute");
                            return;
                          }
                          const rect = clockDialRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const dx = e.clientX - (rect.left + rect.width / 2);
                          const dy = e.clientY - (rect.top + rect.height / 2);
                          const dist = Math.hypot(dx, dy);
                          const minRadius = Math.min(rect.width, rect.height) * 0.08;
                          let minuteValue = clockMinuteRef.current;
                          if (dist >= minRadius) {
                            let angle = Math.atan2(dy, dx) + Math.PI / 2;
                            if (angle < 0) angle += Math.PI * 2;
                            minuteValue = Math.round(angle / (Math.PI * 2 / 60)) % 60;
                          }
                          commitTimeSelection(minuteValue);
                        }}
                        onPointerCancel={(e) => {
                          if (activePointerIdRef.current !== e.pointerId) return;
                          try {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          } catch {
                            /* ignore */
                          }
                          activePointerIdRef.current = null;
                        }}
                      />
                    </div>

                    <div className="flex justify-center">
                      {timeDialMode === "minute" ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary-600 dark:text-primary-400"
                          onClick={() => setTimeDialMode("hour")}
                        >
                          Change hour
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Now", value: new Date() },
                    { label: "+15m", value: addMinutes(new Date(), 15) },
                    { label: "+30m", value: addMinutes(new Date(), 30) },
                    {
                      label: "Tomorrow 09:00",
                      value: (() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        return withTime(d, 9, 0);
                      })(),
                    },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        const next = preset.value;
                        setDraftDateTime(next);
                        setVisibleMonth(new Date(preset.value.getFullYear(), preset.value.getMonth(), 1));
                        setClockHour(to12Hour(next.getHours()));
                        setClockMinute(next.getMinutes());
                        setClockMeridiem(next.getHours() >= 12 ? "PM" : "AM");
                        setTimeDialMode("hour");
                      }}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-full border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                  <span>Selected</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-100">{formatEuropeanDateTime(draftDateTime)}</span>
                </div>

                </div>
              </div>
              </div>
            )}
          </div>
        </div>

        <LocationAutocompleteInput
          label="Location"
          placeholder="Optional location/address"
          value={location}
          onChange={setLocation}
        />

        <div>
          <label htmlFor="start-timer-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <TagAutocompleteInput
              id="start-timer-tags"
              value={tagInput}
              selectedTags={tags}
              onChange={setTagInput}
              onSubmitTag={handleAddTag}
              placeholder="Add a tag"
            />
            <Button type="button" variant="outline" onClick={handleAddTag}>
              Add
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-primary-900 dark:hover:text-primary-100"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Start Timer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
