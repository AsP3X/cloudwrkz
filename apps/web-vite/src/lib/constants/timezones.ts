/**
 * Common IANA timezone identifiers
 * Sorted by UTC offset for easier selection
 * Labels use proper timezone names with UTC offsets
 */
// Human: Curated IANA timezone list for profile/settings pickers with human-readable labels and rough UTC ordering.
// Agent: EXPORT COMMON_TIMEZONES array {value,label}; STATIC data; NO network; CONSUMED by timezone selects.

export const COMMON_TIMEZONES = [
  { value: "UTC", label: "UTC (Coordinated Universal Time)" },
  { value: "America/New_York", label: "Eastern Time (ET) - New York" },
  { value: "America/Chicago", label: "Central Time (CT) - Chicago" },
  { value: "America/Denver", label: "Mountain Time (MT) - Denver" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) - Los Angeles" },
  { value: "America/Phoenix", label: "Mountain Standard Time (MST) - Phoenix" },
  { value: "America/Anchorage", label: "Alaska Time (AKT) - Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii-Aleutian Time (HST) - Honolulu" },
  { value: "America/Toronto", label: "Eastern Time (ET) - Toronto" },
  { value: "America/Vancouver", label: "Pacific Time (PT) - Vancouver" },
  { value: "America/Mexico_City", label: "Central Time (CT) - Mexico City" },
  { value: "America/Sao_Paulo", label: "Brasília Time (BRT) - São Paulo" },
  { value: "America/Buenos_Aires", label: "Argentina Time (ART) - Buenos Aires" },
  { value: "Europe/London", label: "Greenwich Mean Time (GMT/BST) - London" },
  { value: "Europe/Paris", label: "Central European Time (CET/CEST) - Paris" },
  { value: "Europe/Berlin", label: "Central European Time (CET/CEST) - Berlin" },
  { value: "Europe/Rome", label: "Central European Time (CET/CEST) - Rome" },
  { value: "Europe/Madrid", label: "Central European Time (CET/CEST) - Madrid" },
  { value: "Europe/Amsterdam", label: "Central European Time (CET/CEST) - Amsterdam" },
  { value: "Europe/Stockholm", label: "Central European Time (CET/CEST) - Stockholm" },
  { value: "Europe/Vienna", label: "Central European Time (CET/CEST) - Vienna" },
  { value: "Europe/Zurich", label: "Central European Time (CET/CEST) - Zurich" },
  { value: "Europe/Warsaw", label: "Central European Time (CET/CEST) - Warsaw" },
  { value: "Europe/Prague", label: "Central European Time (CET/CEST) - Prague" },
  { value: "Europe/Athens", label: "Eastern European Time (EET/EEST) - Athens" },
  { value: "Europe/Istanbul", label: "Turkey Time (TRT) - Istanbul" },
  { value: "Europe/Moscow", label: "Moscow Time (MSK) - Moscow" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (GST) - Dubai" },
  { value: "Asia/Karachi", label: "Pakistan Standard Time (PKT) - Karachi" },
  { value: "Asia/Kolkata", label: "India Standard Time (IST) - Kolkata" },
  { value: "Asia/Dhaka", label: "Bangladesh Standard Time (BST) - Dhaka" },
  { value: "Asia/Bangkok", label: "Indochina Time (ICT) - Bangkok" },
  { value: "Asia/Singapore", label: "Singapore Time (SGT) - Singapore" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (HKT) - Hong Kong" },
  { value: "Asia/Shanghai", label: "China Standard Time (CST) - Shanghai" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (JST) - Tokyo" },
  { value: "Asia/Seoul", label: "Korea Standard Time (KST) - Seoul" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (AET) - Sydney" },
  { value: "Australia/Melbourne", label: "Australian Eastern Time (AET) - Melbourne" },
  { value: "Australia/Brisbane", label: "Australian Eastern Time (AET) - Brisbane" },
  { value: "Australia/Perth", label: "Australian Western Time (AWST) - Perth" },
  { value: "Pacific/Auckland", label: "New Zealand Time (NZST/NZDT) - Auckland" },
];

export function getTimezoneLabel(value: string | null | undefined): string {
  if (!value) return "UTC";
  const tz = COMMON_TIMEZONES.find((tz) => tz.value === value);
  return tz ? tz.label : value;
}
