// Human: Merges newly picked tags into an existing list without duplicate names (case-insensitive).
// Agent: READS existing[] toAdd[]; RETURNS merged string[]; TRIMS entries; SKIPS empty and duplicate keys.

export function mergeTimeEntryTags(existing: string[], toAdd: string[]): string[] {
  const merged = [...existing];
  const keys = new Set(existing.map((t) => t.trim().toLowerCase()));
  for (const tag of toAdd) {
    const trimmed = tag.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(trimmed);
  }
  return merged;
}
