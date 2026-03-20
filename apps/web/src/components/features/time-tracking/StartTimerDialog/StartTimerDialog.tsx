"use client";

import React from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { createTimeEntrySchema, type CreateTimeEntryInput } from "@/lib/validations/time-tracking";
import { createTimeEntry } from "@/server/actions/time-tracking";
import { useRouter } from "next/navigation";
import { LocationAutocompleteInput } from "@/components/ui/LocationAutocompleteInput";

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

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

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

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartTimerDialog({ open, onOpenChange }: StartTimerDialogProps) {
  const router = useRouter();
  const pickerTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [serverError, setServerError] = React.useState<string | null>(null);
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

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    control,
    watch,
    setValue,
  } = useForm<CreateTimeEntryInput>({
    resolver: zodResolver(createTimeEntrySchema),
    defaultValues: {
      name: "",
      description: "",
      tags: [],
      billable: false,
      // startedAt will be set on dialog open on the client to avoid hydration issues
      startedAt: undefined,
    },
  });

  React.useEffect(() => {
    if (!open) {
      reset();
      setTags([]);
      setTagInput("");
      setServerError(null);
    }
  }, [open, reset]);

  // When the dialog opens, set a default startedAt to "now" on the client if not already set.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/incompatible-library
      const currentStartedAt = watch("startedAt"); // React Hook Form watch is safe here
      if (!currentStartedAt) {
        setValue("startedAt", new Date());
      }
    }
  }, [open, watch, setValue]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed];
      setTags(newTags);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const onSubmit = async (data: CreateTimeEntryInput) => {
    setServerError(null);

    try {
      const result = await createTimeEntry({
        ...data,
        tags: tags.length > 0 ? tags : undefined,
        location: data.location?.trim() || undefined,
      });

      if (result.success) {
        onOpenChange(false);
        router.refresh();
      } else {
        setServerError(result.error || "Failed to start timer");
      }
    } catch (error: any) {
      setServerError(error.message || "Failed to start timer");
    }
  };

  const startedAt = watch("startedAt");

  React.useEffect(() => {
    if (!startedAt) {
      setStartedAtInput("");
      return;
    }
    const date = new Date(startedAt);
    if (isNaN(date.getTime())) {
      setStartedAtInput("");
      return;
    }
    setStartedAtInput(formatEuropeanDateTime(date));
  }, [startedAt]);

  React.useEffect(() => {
    if (!isDateTimePickerOpen) return;
    const source = startedAt ? new Date(startedAt) : new Date();
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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      description="Create a new time tracking entry"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {serverError && (
          <div className="p-4 rounded-lg bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800">
            <p className="text-sm text-error-600 dark:text-error-400">{serverError}</p>
          </div>
        )}

        <Input
          label="Name"
          placeholder="Enter timer name (optional)"
          helperText="Leave empty to auto-generate a timer number (e.g., #TMR-000001)"
          {...register("name")}
          error={errors.name?.message}
        />

        <Textarea
          label="Description"
          placeholder="Optional description"
          {...register("description")}
          error={errors.description?.message}
        />

        <div>
          <label htmlFor="start-timer-start-time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Start Time
          </label>
          <Controller
            name="startedAt"
            control={control}
            render={({ field }) => (
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
                        className={`space-y-4 transition-all duration-300 ease-out ${
                          pickerStep === "time"
                            ? "translate-x-0 opacity-100"
                            : "translate-x-6 opacity-0 pointer-events-none absolute inset-0"
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setTimeDialMode("hour")}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              timeDialMode === "hour"
                                ? "bg-primary-600 text-white"
                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            Hour
                          </button>
                          <button
                            type="button"
                            onClick={() => setTimeDialMode("minute")}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                              timeDialMode === "minute"
                                ? "bg-primary-600 text-white"
                                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                            }`}
                          >
                            Minute
                          </button>
                        </div>

                        <div className="flex items-center justify-center gap-2">
                          {(["AM", "PM"] as const).map((meridiem) => (
                            <button
                              key={meridiem}
                              type="button"
                              onClick={() => setClockMeridiem(meridiem)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                                clockMeridiem === meridiem
                                  ? "bg-primary-600 text-white"
                                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                              }`}
                            >
                              {meridiem}
                            </button>
                          ))}
                        </div>

                        <div className="mx-auto relative w-52 h-52 rounded-full bg-gradient-to-b from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-inner">
                          {(timeDialMode === "hour"
                            ? Array.from({ length: 12 }, (_, i) => i + 1).map((value) => ({
                                label: String(value),
                                value,
                              }))
                            : Array.from({ length: 12 }, (_, i) => i * 5).map((value) => ({
                                label: String(value).padStart(2, "0"),
                                value,
                              }))
                          ).map((tick, idx) => {
                            const angle = (idx / 12) * Math.PI * 2 - Math.PI / 2;
                            const x = 50 + Math.cos(angle) * 40;
                            const y = 50 + Math.sin(angle) * 40;
                            const selected =
                              timeDialMode === "hour" ? clockHour === tick.value : clockMinute === tick.value;
                            return (
                              <button
                                key={`${timeDialMode}-${tick.value}`}
                                type="button"
                                onClick={() => {
                                  if (timeDialMode === "hour") {
                                    setClockHour(tick.value);
                                    setTimeDialMode("minute");
                                  } else {
                                    setClockMinute(tick.value);
                                    const next = withTime(
                                      startOfDay(draftDateTime),
                                      to24Hour(clockHour, clockMeridiem),
                                      tick.value
                                    );
                                    field.onChange(next);
                                    setStartedAtInput(formatEuropeanDateTime(next));
                                    setServerError(null);
                                    setIsDateTimePickerOpen(false);
                                  }
                                }}
                                className={`absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full text-[11px] font-semibold transition ${
                                  selected
                                    ? "bg-primary-600 text-white shadow-lg"
                                    : "bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-primary-50 dark:hover:bg-neutral-600"
                                }`}
                                style={{ left: `${x}%`, top: `${y}%` }}
                              >
                                {tick.label}
                              </button>
                            );
                          })}
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-2 rounded-xl bg-white/90 dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-600 shadow">
                            <span className="text-xs font-bold text-neutral-900 dark:text-neutral-100">
                              {String(clockHour).padStart(2, "0")}:{String(clockMinute).padStart(2, "0")} {clockMeridiem}
                            </span>
                          </div>
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
            )}
          />
        </div>

        <Controller
          name="location"
          control={control}
          render={({ field }) => (
            <LocationAutocompleteInput
              label="Location"
              placeholder="Optional location/address"
              value={field.value ?? ""}
              onChange={(val) => field.onChange(val)}
              error={errors.location?.message}
            />
          )}
        />

        <div>
          <label htmlFor="start-timer-tags" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Tags
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              id="start-timer-tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add a tag"
              className="flex-1 px-4 py-2 rounded-lg border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
