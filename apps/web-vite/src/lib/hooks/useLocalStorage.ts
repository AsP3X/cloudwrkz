// Human: React state backed by `localStorage` JSON so simple UI preferences survive reloads in the same browser.
// Agent: READS key on init; WRITES JSON.stringify on set; LOGS errors via logger; RETURNS tuple like useState.

import { useState } from "react";
import { log } from "@/lib/logger";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      log.error(`Error setting localStorage key "${key}"`, error);
    }
  };

  return [storedValue, setValue];
}
