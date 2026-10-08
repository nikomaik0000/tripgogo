import type { CollectionItemStatus, TravelItemType, Trip } from "@/lib/types";

const COMMON_FIELDS = ["type", "category", "area", "name", "businessHours", "googleMapsUrl", "link1", "link2", "note"] as const;
const MODE_FIELDS = ["date", "status", "rating", "completedDate", "consumedItems", "experienceNote"] as const;
const ALLOWED_FIELDS = new Set<string>([...COMMON_FIELDS, ...MODE_FIELDS]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TravelImportItem = {
  type: TravelItemType;
  category: string;
  area: string;
  name: string;
  date: string | null;
  businessHours: string;
  googleMapsUrl: string;
  link1: string;
  link2: string;
  note: string;
  status: CollectionItemStatus | null;
  rating: number | null;
  completedDate: string | null;
  consumedItems: string;
  experienceNote: string;
};

export type TravelImportPreviewRow = {
  index: number;
  item?: TravelImportItem;
  errors: string[];
};

export type TravelImportPreview = {
  rows: TravelImportPreviewRow[];
  parseError?: string;
};

export type TravelImportFailure = {
  index: number;
  message: string;
};

export type TravelImportResult = {
  successCount: number;
  failureCount: number;
  failures: TravelImportFailure[];
};

export function parseTravelImport(source: string, trip: Trip): TravelImportPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return { rows: [], parseError: `JSON 無法解析：${error instanceof Error ? error.message : "格式錯誤"}` };
  }

  if (!Array.isArray(parsed)) return { rows: [], parseError: "最外層必須是 JSON array。" };
  if (parsed.length === 0) return { rows: [], parseError: "JSON array 至少需要一筆資料。" };
  return { rows: parsed.map((value, index) => validateRow(value, index, trip)) };
}

export function getTravelImportPrompt(trip: Trip) {
  const common = "type, category, area, name, businessHours, googleMapsUrl, link1, link2, note";
  if (trip.mode === "trip") {
    return [
      "請將以上內容轉成 TripGoGo JSON 格式。",
      "只輸出 JSON array，不要使用 markdown code fence，不要加入任何額外說明文字。",
      `每筆只允許以下欄位：${common}, date, rating, consumedItems, experienceNote。`,
      "type 只能是 place 或 food；name 與 date 必填。",
      `date 必須使用 YYYY-MM-DD，且必須位於目前旅程 ${trip.startDate ?? ""} 至 ${trip.endDate ?? ""} 之間。`,
      "rating 若提供必須是 0 到 100 的數字；consumedItems 只適用於 food。",
      "沒有資料的選填字串請使用空字串或省略欄位。",
    ].join("\n");
  }

  return [
    "請將以上內容轉成 TripGoGo JSON 格式。",
    "只輸出 JSON array，不要使用 markdown code fence，不要加入任何額外說明文字。",
    `每筆只允許以下欄位：${common}, status, rating, completedDate, consumedItems, experienceNote。`,
    "type 只能是 place 或 food；name 必填；不要輸出 date。",
    "status 只能是 planned 或 completed；未提供時預設 planned。",
    "completedDate 若提供必須使用 YYYY-MM-DD；rating 若提供必須是 0 到 100 的數字；consumedItems 只適用於 food。",
    "沒有資料的選填字串請使用空字串或省略欄位。",
  ].join("\n");
}

function validateRow(value: unknown, index: number, trip: Trip): TravelImportPreviewRow {
  if (!isRecord(value)) return { index, errors: ["每筆資料必須是 JSON object。"] };

  const errors: string[] = [];
  const unknownFields = Object.keys(value).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length > 0) errors.push(`不支援欄位：${unknownFields.join("、")}`);

  const typeValue = value.type;
  const type = typeValue === "place" || typeValue === "food" ? typeValue : undefined;
  if (!type) errors.push("type 必須是 place 或 food。");

  const name = readString(value, "name", errors, true);
  const category = readString(value, "category", errors);
  const area = readString(value, "area", errors);
  const businessHours = readString(value, "businessHours", errors);
  const googleMapsUrl = readString(value, "googleMapsUrl", errors);
  const link1 = readString(value, "link1", errors);
  const link2 = readString(value, "link2", errors);
  const note = readString(value, "note", errors);
  const consumedItems = readString(value, "consumedItems", errors);
  const experienceNote = readString(value, "experienceNote", errors);
  validateUrl("googleMapsUrl", googleMapsUrl, errors);
  validateUrl("link1", link1, errors);
  validateUrl("link2", link2, errors);

  const inputDate = readDate(value, "date", errors);
  const inputCompletedDate = readDate(value, "completedDate", errors);
  const status = readStatus(value, errors);
  const rating = readRating(value, errors);

  let date: string | null = null;
  let completedDate: string | null = null;
  let normalizedStatus: CollectionItemStatus | null = null;
  if (trip.mode === "trip") {
    if (!inputDate) {
      if (value.date === undefined || value.date === null || value.date === "") errors.push("Trip 資料必須提供 date，格式為 YYYY-MM-DD。");
    } else if (!trip.startDate || !trip.endDate || inputDate < trip.startDate || inputDate > trip.endDate) {
      errors.push(`date 必須位於 ${trip.startDate ?? "Trip 起日"} 至 ${trip.endDate ?? "Trip 迄日"} 之間。`);
    } else {
      date = inputDate;
    }
  } else {
    normalizedStatus = status ?? "planned";
    completedDate = inputCompletedDate;
  }

  if (type === "place" && consumedItems) errors.push("consumedItems 只適用於 food。");

  const item = type && name ? {
    type,
    category,
    area,
    name,
    date,
    businessHours,
    googleMapsUrl,
    link1,
    link2,
    note,
    status: normalizedStatus,
    rating,
    completedDate,
    consumedItems: type === "food" ? consumedItems : "",
    experienceNote,
  } satisfies TravelImportItem : undefined;

  return { index, item, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string, errors: string[], required = false) {
  const value = record[key];
  if (value === undefined || value === null) {
    if (required) errors.push(`${key} 為必填欄位。`);
    return "";
  }
  if (typeof value !== "string") {
    errors.push(`${key} 必須是字串。`);
    return "";
  }
  const normalized = value.trim();
  if (required && !normalized) errors.push(`${key} 不可為空白。`);
  return normalized;
}

function readDate(record: Record<string, unknown>, key: string, errors: string[]) {
  const value = record[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !isIsoDate(value)) {
    errors.push(`${key} 必須是有效的 YYYY-MM-DD 日期。`);
    return null;
  }
  return value;
}

function readStatus(record: Record<string, unknown>, errors: string[]) {
  const value = record.status;
  if (value === undefined || value === null || value === "") return null;
  if (value !== "planned" && value !== "completed") {
    errors.push("status 必須是 planned 或 completed。");
    return null;
  }
  return value;
}

function readRating(record: Record<string, unknown>, errors: string[]) {
  const value = record.rating;
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    errors.push("rating 必須是 0 到 100 的數字。");
    return null;
  }
  return value;
}

function isIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateUrl(key: string, value: string, errors: string[]) {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
  } catch {
    errors.push(`${key} 必須是有效的 http(s) 網址。`);
  }
}
