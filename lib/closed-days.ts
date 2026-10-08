import type { ClosedRuleType, ClosedRuleValue } from "@/lib/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const SPECIFIC_DATE_DISPLAY_LIMIT = 2;

export type ClosedRuleValidation = {
  values: ClosedRuleValue[] | null;
  error?: string;
};

export function validateClosedRuleValues(type: ClosedRuleType | null, value: unknown): ClosedRuleValidation {
  if (!type) {
    if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
      return { values: null };
    }
    return { values: null, error: "closedRuleValues 必須搭配 closedRuleType。" };
  }

  if (type === "irregular") {
    if (value === undefined || value === null) return { values: [] };
    if (!Array.isArray(value) || value.length > 0) {
      return { values: [], error: "irregular 的 closedRuleValues 必須是空陣列或省略。" };
    }
    return { values: [] };
  }

  if (!Array.isArray(value) || value.length === 0) {
    return { values: null, error: `${type} 的 closedRuleValues 必須是非空陣列。` };
  }
  if (new Set(value).size !== value.length) {
    return { values: null, error: "closedRuleValues 不可包含重複值。" };
  }

  if (type === "weekday") {
    if (!value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 6)) {
      return { values: null, error: "weekday 的 closedRuleValues 必須是 0–6 的整數陣列。" };
    }
    return { values: sortWeekdays(value as number[]) };
  }

  if (type === "monthly_date") {
    if (!value.every((entry) => typeof entry === "number" && Number.isInteger(entry) && entry >= 1 && entry <= 31)) {
      return { values: null, error: "monthly_date 的 closedRuleValues 必須是 1–31 的整數陣列。" };
    }
    return { values: [...value as number[]].sort((a, b) => a - b) };
  }

  if (!value.every((entry) => typeof entry === "string" && isValidIsoDate(entry))) {
    return { values: null, error: "specific_date 的 closedRuleValues 必須是真實有效的 YYYY-MM-DD 日期陣列。" };
  }
  return { values: [...value as string[]].sort() };
}

export function formatClosedDaysText(type: ClosedRuleType, values: ClosedRuleValue[]) {
  if (type === "irregular") return "不定休";

  if (type === "weekday") {
    const weekdays = sortWeekdays(values.filter((value): value is number => typeof value === "number"));
    return weekdays.length > 0 ? `週${weekdays.map((value) => WEEKDAY_LABELS[value]).join("、")}` : "";
  }

  if (type === "monthly_date") {
    const dates = values.filter((value): value is number => typeof value === "number").sort((a, b) => a - b);
    return dates.length > 0 ? `每月${dates.join("、")}日` : "";
  }

  const dates = values.filter((value): value is string => typeof value === "string" && isValidIsoDate(value)).sort();
  const visible = dates.slice(0, SPECIFIC_DATE_DISPLAY_LIMIT).map(formatSpecificDate);
  return visible.length > 0 ? `${visible.join("、")}${dates.length > SPECIFIC_DATE_DISPLAY_LIMIT ? "…" : ""}` : "";
}

export function isClosedOnDate(
  type: ClosedRuleType | null | undefined,
  values: ClosedRuleValue[] | null | undefined,
  currentDate: Date
) {
  if (!type || type === "irregular" || !values) return false;
  if (type === "weekday") return values.includes(currentDate.getDay());
  if (type === "monthly_date") return values.includes(currentDate.getDate());
  return values.includes(toLocalIsoDate(currentDate));
}

export function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sortWeekdays(values: number[]) {
  const order = new Map<number, number>(WEEKDAY_DISPLAY_ORDER.map((value, index) => [value, index]));
  return [...values].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

function formatSpecificDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function toLocalIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
