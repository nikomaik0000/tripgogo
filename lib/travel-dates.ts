import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { Trip } from "@/lib/types";

export function tripDates(trip: Trip) {
  try {
    return eachDayOfInterval({ start: parseISO(trip.startDate), end: parseISO(trip.endDate) }).map((date) => format(date, "yyyy-MM-dd"));
  } catch {
    return [];
  }
}

export function displayDate(date: string) {
  return format(parseISO(date), "M/d");
}

export function dateOptions(trip: Trip) {
  const dates = tripDates(trip);
  const sameMonth = dates.length > 0 && dates.every((date) => date.slice(0, 7) === dates[0].slice(0, 7));
  return dates.map((date) => ({ value: date, label: sameMonth ? String(parseISO(date).getDate()) : displayDate(date) }));
}
