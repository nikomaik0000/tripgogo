import { formatClosedDaysText, validateClosedRuleValues } from "@/lib/closed-days";
import type { ClosedRuleType, ClosedRuleValue, CollectionItemStatus, Flight, HotelStay, TravelItemType, Trip } from "@/lib/types";

const COMMON_FIELDS = ["type", "category", "area", "name", "businessHours", "closedDaysText", "closedRuleType", "closedRuleValues", "googleMapsUrl", "link1", "link2", "note"] as const;
const MODE_FIELDS = ["date", "status", "rating", "completedDate", "consumedItems", "experienceNote"] as const;
const ALLOWED_FIELDS = new Set<string>([...COMMON_FIELDS, ...MODE_FIELDS]);
const FLIGHT_FIELDS = new Set(["airline", "flightNumber", "departurePlace", "arrivalPlace", "departureDate", "departureTime", "arrivalDate", "arrivalTime", "link", "note"]);
const HOTEL_FIELDS = new Set(["name", "checkInDate", "checkOutDate", "checkInTime", "checkOutTime", "address", "phone", "googleMapsUrl", "link", "note"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export type TravelImportItem = {
  type: TravelItemType;
  category: string;
  area: string;
  name: string;
  date: string | null;
  businessHours: string;
  closedDaysText: string;
  closedRuleType: ClosedRuleType | null;
  closedRuleValues: ClosedRuleValue[] | null;
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

export type FlightImportItem = Omit<Flight, "id" | "tripId" | "createdAt" | "updatedAt">;
export type HotelImportItem = Omit<HotelStay, "id" | "tripId" | "createdAt" | "updatedAt">;

export type ImportPreviewRow<T> = {
  index: number;
  item?: T;
  errors: string[];
};

export type ImportPreview<T> = {
  rows: ImportPreviewRow<T>[];
  parseError?: string;
};

export type TravelImportPreviewRow = ImportPreviewRow<TravelImportItem>;
export type TravelImportPreview = ImportPreview<TravelImportItem>;
export type FlightImportPreview = ImportPreview<FlightImportItem>;
export type HotelImportPreview = ImportPreview<HotelImportItem>;

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
  return parseImportArray(source, (value, index) => validateRow(value, index, trip));
}

export function parseFlightImport(source: string): FlightImportPreview {
  return parseImportArray(source, validateFlightRow);
}

export function parseHotelImport(source: string): HotelImportPreview {
  return parseImportArray(source, validateHotelRow);
}

function parseImportArray<T>(source: string, validate: (value: unknown, index: number) => ImportPreviewRow<T>): ImportPreview<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripOuterJsonCodeFence(source));
  } catch (error) {
    return { rows: [], parseError: `JSON 無法解析：${error instanceof Error ? error.message : "格式錯誤"}` };
  }

  if (!Array.isArray(parsed)) return { rows: [], parseError: "最外層必須是 JSON array。" };
  if (parsed.length === 0) return { rows: [], parseError: "JSON array 至少需要一筆資料。" };
  return { rows: parsed.map(validate) };
}

export function getTravelImportPrompt(trip: Trip) {
  const common = "type, category, area, name, businessHours, closedDaysText, closedRuleType, closedRuleValues, googleMapsUrl, link1, link2, note";
  const closedDaysRules = [
    "店休日只輸出精簡資訊，不要把一般固定店休日重複寫入 note；查無資訊時省略 closedDaysText、closedRuleType、closedRuleValues。",
    "weekday：closedRuleType 為 weekday，closedRuleValues 使用 0–6（0=週日）；monthly_date 使用 1–31；specific_date 使用真實有效的 YYYY-MM-DD；irregular 使用空陣列。",
    "closedDaysText 使用短文字，例如週一、五、每月5日、不定休、依商場公告；不要輸出長句。",
  ];
  const linkAndHoursRules = [
    "googleMapsUrl 優先填入可直接開啟該店家或景點的真實 Google Maps place URL；若無法確認精確 place URL，使用 https://www.google.com/maps/search/?api=1&query=...，query 由名稱加地區或城市組成。不要虛構 maps.app.goo.gl 或其他短網址；除非名稱資訊不足以定位，否則盡量不要留空。",
    "link1 優先填入官方網站；若無官網，可填入可信且有用的介紹、菜單或官方資訊頁。link2 對 food 只填訂位網址，對 place 只填訂票或預約網址；無法確認時省略或留空。所有連結都不得虛構。",
    "businessHours 只填一般或主要營業時間。若僅某一天或少數幾天時間不同，將差異以極簡格式寫入 note，例如「星期天：11:00~23:00」；若 note 已有內容就簡短接在後面，不要寫成說明長句，也不要把整套 weekly hours 塞入 businessHours。店休日仍只使用 closedDays 欄位。",
  ];
  if (trip.mode === "trip") {
    return [
      "請將以上內容轉成 TripGoGo JSON 格式。",
      "最終回覆只輸出一個標示為 json 的 Markdown code block，內容必須是 JSON array；不要在 code block 前後加入任何說明或其他文字。",
      `每筆只允許以下欄位：${common}, date, rating, consumedItems, experienceNote。`,
      "type 只能是 place 或 food；name 與 date 必填。",
      `date 必須使用 YYYY-MM-DD，且必須位於目前旅程 ${trip.startDate ?? ""} 至 ${trip.endDate ?? ""} 之間。`,
      "rating 若提供必須是 0 到 100 的數字；consumedItems 只適用於 food。",
      ...linkAndHoursRules,
      ...closedDaysRules,
      "沒有資料的選填字串請使用空字串或省略欄位。",
    ].join("\n");
  }

  return [
    "請將以上內容轉成 TripGoGo JSON 格式。",
    "最終回覆只輸出一個標示為 json 的 Markdown code block，內容必須是 JSON array；不要在 code block 前後加入任何說明或其他文字。",
    `每筆只允許以下欄位：${common}, status, rating, completedDate, consumedItems, experienceNote。`,
    "type 只能是 place 或 food；name 必填；不要輸出 date。",
    "status 只能是 planned 或 completed；未提供時預設 planned。",
    "completedDate 若提供必須使用 YYYY-MM-DD；rating 若提供必須是 0 到 100 的數字；consumedItems 只適用於 food。",
    ...linkAndHoursRules,
    ...closedDaysRules,
    "沒有資料的選填字串請使用空字串或省略欄位。",
  ].join("\n");
}

export function getFlightFormatPrompt() {
  const example = [{
    airline: "...",
    flightNumber: "...",
    departurePlace: "...",
    arrivalPlace: "...",
    departureDate: "YYYY-MM-DD",
    departureTime: "HH:mm",
    arrivalDate: "YYYY-MM-DD",
    arrivalTime: "HH:mm",
    link: "",
    note: "",
  }];
  return [
    "請將以上電子機票、訂位文字或航班資訊整理成 TripGoGo 機票 JSON 格式。",
    "最外層必須是 JSON array，即使只有一段航班也必須使用 array；多段航班各自成為一筆 object。",
    "每筆只允許以下欄位：airline, flightNumber, departurePlace, arrivalPlace, departureDate, departureTime, arrivalDate, arrivalTime, link, note。",
    "日期使用 YYYY-MM-DD，時間使用 24 小時制 HH:mm。只依使用者提供的現有資訊整理，不要自行猜測不存在的航空公司、航班編號、機場、日期、時間或網址。",
    "link 與 note 為選填；沒有資料時使用空字串或省略欄位。",
    "輸出格式：",
    JSON.stringify(example, null, 2),
    "最終回覆只輸出一個標示為 json 的 Markdown code block，code block 內只放上述 JSON array；不要在 code block 前後加入任何說明或其他文字。",
  ].join("\n");
}

export function getHotelFormatPrompt() {
  const example = [{
    name: "...",
    checkInDate: "YYYY-MM-DD",
    checkOutDate: "YYYY-MM-DD",
    checkInTime: "",
    checkOutTime: "",
    address: "",
    phone: "",
    googleMapsUrl: "",
    link: "",
    note: "",
  }];
  return [
    "請將以上住宿確認、訂房文字或飯店資訊整理成 TripGoGo 飯店 JSON 格式。",
    "最外層必須是 JSON array，即使只有一間飯店也必須使用 array；多間飯店各自成為一筆 object。",
    "每筆只允許以下欄位：name, checkInDate, checkOutDate, checkInTime, checkOutTime, address, phone, googleMapsUrl, link, note。",
    "日期使用 YYYY-MM-DD，時間使用 24 小時制 HH:mm。未提供的 Check-in 或 Check-out 時間不要自行猜測；其他缺少的選填資料使用空字串或省略欄位。",
    "googleMapsUrl 優先填入可確認的真實 Google Maps place URL；若無精確網址，可使用 https://www.google.com/maps/search/?api=1&query=...，query 由飯店名稱加地區或城市組成。不要虛構 maps.app.goo.gl 或其他短網址。",
    "link 優先填入飯店官方網站或正式訂房資訊頁；無法確認時留空，不要虛構網址。",
    "輸出格式：",
    JSON.stringify(example, null, 2),
    "最終回覆只輸出一個標示為 json 的 Markdown code block，code block 內只放上述 JSON array；不要在 code block 前後加入任何說明或其他文字。",
  ].join("\n");
}

function stripOuterJsonCodeFence(source: string) {
  const trimmed = source.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
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
  let closedDaysText = readString(value, "closedDaysText", errors);
  const closedRuleType = readClosedRuleType(value, errors);
  const closedRuleValidation = validateClosedRuleValues(closedRuleType, value.closedRuleValues);
  if (closedRuleValidation.error) errors.push(closedRuleValidation.error);
  const closedRuleValues = closedRuleValidation.values;
  if (closedRuleType && !closedDaysText && closedRuleValues) {
    closedDaysText = formatClosedDaysText(closedRuleType, closedRuleValues);
  }
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
    closedDaysText,
    closedRuleType,
    closedRuleValues,
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

function validateFlightRow(value: unknown, index: number): ImportPreviewRow<FlightImportItem> {
  if (!isRecord(value)) return { index, errors: ["每筆資料必須是 JSON object。"] };

  const errors: string[] = [];
  validateKnownFields(value, FLIGHT_FIELDS, errors);
  const airline = readString(value, "airline", errors, true);
  const flightNumber = readString(value, "flightNumber", errors, true);
  const departurePlace = readString(value, "departurePlace", errors, true);
  const arrivalPlace = readString(value, "arrivalPlace", errors, true);
  const departureDate = readRequiredDate(value, "departureDate", errors);
  const departureTime = readTime(value, "departureTime", errors, true);
  const arrivalDate = readRequiredDate(value, "arrivalDate", errors);
  const arrivalTime = readTime(value, "arrivalTime", errors, true);
  const link = readString(value, "link", errors);
  const note = readString(value, "note", errors);
  validateUrl("link", link, errors);

  if (departureDate && departureTime && arrivalDate && arrivalTime && `${arrivalDate}T${arrivalTime}` < `${departureDate}T${departureTime}`) {
    errors.push("抵達日期時間不可早於出發日期時間。");
  }

  const item = airline && flightNumber && departurePlace && arrivalPlace && departureDate && departureTime && arrivalDate && arrivalTime ? {
    airline,
    flightNumber,
    departurePlace,
    arrivalPlace,
    departureDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    link: link || undefined,
    note: note || undefined,
  } satisfies FlightImportItem : undefined;

  return { index, item, errors };
}

function validateHotelRow(value: unknown, index: number): ImportPreviewRow<HotelImportItem> {
  if (!isRecord(value)) return { index, errors: ["每筆資料必須是 JSON object。"] };

  const errors: string[] = [];
  validateKnownFields(value, HOTEL_FIELDS, errors);
  const name = readString(value, "name", errors, true);
  const checkInDate = readRequiredDate(value, "checkInDate", errors);
  const checkOutDate = readRequiredDate(value, "checkOutDate", errors);
  const checkInTime = readTime(value, "checkInTime", errors);
  const checkOutTime = readTime(value, "checkOutTime", errors);
  const address = readString(value, "address", errors);
  const phone = readString(value, "phone", errors);
  const googleMapsUrl = readString(value, "googleMapsUrl", errors);
  const link = readString(value, "link", errors);
  const note = readString(value, "note", errors);
  validateUrl("googleMapsUrl", googleMapsUrl, errors);
  validateUrl("link", link, errors);

  if (checkInDate && checkOutDate && checkOutDate < checkInDate) {
    errors.push("checkOutDate 不可早於 checkInDate。");
  }

  const item = name && checkInDate && checkOutDate ? {
    name,
    checkInDate,
    checkOutDate,
    checkInTime: checkInTime || undefined,
    checkOutTime: checkOutTime || undefined,
    address: address || undefined,
    phone: phone || undefined,
    googleMapsUrl: googleMapsUrl || undefined,
    link: link || undefined,
    note: note || undefined,
  } satisfies HotelImportItem : undefined;

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

function readRequiredDate(record: Record<string, unknown>, key: string, errors: string[]) {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    errors.push(`${key} 為必填欄位。`);
    return "";
  }
  return readDate(record, key, errors) ?? "";
}

function readTime(record: Record<string, unknown>, key: string, errors: string[], required = false) {
  const value = record[key];
  if (value === undefined || value === null || value === "") {
    if (required) errors.push(`${key} 為必填欄位。`);
    return "";
  }
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) {
    errors.push(`${key} 必須是有效的 HH:mm 時間。`);
    return "";
  }
  return value;
}

function validateKnownFields(record: Record<string, unknown>, fields: Set<string>, errors: string[]) {
  const unknownFields = Object.keys(record).filter((key) => !fields.has(key));
  if (unknownFields.length > 0) errors.push(`不支援欄位：${unknownFields.join("、")}`);
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

function readClosedRuleType(record: Record<string, unknown>, errors: string[]): ClosedRuleType | null {
  const value = record.closedRuleType;
  if (value === undefined || value === null || value === "") return null;
  if (value !== "weekday" && value !== "monthly_date" && value !== "specific_date" && value !== "irregular") {
    errors.push("closedRuleType 必須是 weekday、monthly_date、specific_date 或 irregular。");
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
