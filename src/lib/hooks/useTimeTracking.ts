"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createTimeEntry,
  pauseTimeEntry,
  resumeTimeEntry,
  stopTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
  type CreateTimeEntryInput,
  type UpdateTimeEntryInput,
} from "@/server/actions/time-tracking";

export function useTimeTracking() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startTimer = async (input: CreateTimeEntryInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await createTimeEntry(input);
      if (result.success) {
        router.refresh();
        return result;
      } else {
        setError(result.error || "Failed to start timer");
        return result;
      }
    } catch (err: any) {
      const errorMsg = err.message || "Failed to start timer";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const pause = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await pauseTimeEntry(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to pause timer");
      }
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to pause timer";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const resume = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await resumeTimeEntry(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to resume timer");
      }
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to resume timer";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const stop = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await stopTimeEntry(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to stop timer");
      }
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to stop timer";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteTimeEntry(id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to delete entry");
      }
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to delete entry";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  const update = async (id: string, input: UpdateTimeEntryInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await updateTimeEntry(id, input);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Failed to update entry");
      }
      return result;
    } catch (err: any) {
      const errorMsg = err.message || "Failed to update entry";
      setError(errorMsg);
      return { success: false as const, error: errorMsg };
    } finally {
      setLoading(false);
    }
  };

  return {
    startTimer,
    pause,
    resume,
    stop,
    delete: remove,
    update,
    loading,
    error,
  };
}
