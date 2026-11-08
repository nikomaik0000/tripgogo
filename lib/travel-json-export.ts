import { parseTravelImport, type TravelImportItem } from "@/lib/travel-import";
import { buildTravelUpdatePatch, type TravelUpdateAnalysisRow } from "@/lib/travel-update-import";
import type { TravelItem, Trip } from "@/lib/types";

export type TravelJsonExportItem = Pick<TravelImportItem, "type" | "name" | "date"> & Partial<
  Pick<TravelImportItem,
    | "category"
    | "area"
    | "businessHours"
    | "closedDaysText"
    | "closedRuleType"
    | "closedRuleValues"
    | "googleMapsUrl"
    | "link1"
    | "link2"
    | "note"
    | "priceList"
    | "priceCheckedAt"
    | "priceSource"
    | "status"
    | "rating"
    | "completedDate"
    | "consumedItems"
    | "experienceNote"
  >
>;

export type TravelJsonExportIssue = {
  name: string;
  messages: string[];
};

export type TravelJsonExportDuplicate = {
  type: TravelItem["type"];
  name: string;
  count: number;
};

export type TravelJsonExportResult = {
  items: TravelJsonExportItem[];
  json?: string;
  issues: TravelJsonExportIssue[];
  duplicates: TravelJsonExportDuplicate[];
};

export function createTravelJsonExport(trip: Trip, items: TravelItem[]): TravelJsonExportResult {
  const sources = items
    .filter((item) => item.tripId === trip.id)
    .sort(compareDailyOrder);
  const exportItems = sources.map(toExportItem);
  const duplicates = duplicateNames(sources);
  if (sources.length === 0) return { items: [], issues: [], duplicates };

  const sourceIssues = sources.flatMap((item) => {
    const messages: string[] = [];
    if (trip.mode === "collection" && item.date !== null) messages.push("Collection 的 date 必須維持 null。");
    if (trip.mode === "collection" && item.status === null) messages.push("Collection 必須具有 planned 或 completed 狀態。");
    return messages.length > 0 ? [{ name: item.name, messages }] : [];
  });
  if (sourceIssues.length > 0) return { items: exportItems, issues: sourceIssues, duplicates };

  const json = JSON.stringify(exportItems, null, 2);
  const preview = parseTravelImport(json, trip, {
    allowUnscheduledTripDate: true,
    collectionUpdateMode: trip.mode === "collection",
    preserveOptionalTextWhitespace: true,
  });
  if (preview.parseError) {
    return { items: exportItems, issues: [{ name: trip.name, messages: [preview.parseError] }], duplicates };
  }

  const issues = preview.rows.flatMap((row, index) => {
    const source = sources[index];
    const name = source?.name || exportItems[index]?.name || `第 ${index + 1} 筆`;
    if (row.errors.length > 0 || !row.item) {
      return [{ name, messages: row.errors.length > 0 ? row.errors : ["無法建立可重新匯入的行程資料。"] }];
    }

    const analysisRow: TravelUpdateAnalysisRow = {
      index,
      item: row.item,
      providedFields: row.providedFields ?? [],
      sourceValues: row.sourceValues ?? {},
      requiresManualMatch: false,
      suggestedIds: [source.id],
      defaultResolution: { kind: "update", existingId: source.id, confirmed: true },
    };
    const { diffs } = buildTravelUpdatePatch(analysisRow, source, new Set());
    return diffs.length > 0
      ? [{ name, messages: [`依現有匯入規格重新解析後會改變：${diffs.map((diff) => diff.label).join("、")}`] }]
      : [];
  });

  return { items: exportItems, json: issues.length === 0 ? json : undefined, issues, duplicates };
}

export function travelJsonFilename(tripName: string, now = new Date()) {
  const cleanedName = tripName
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*%]/g, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  const safeName = [...cleanedName].slice(0, 80).join("") || "旅程";
  return `TripGoGo_${safeName}_${localIsoDate(now)}.json`;
}

function toExportItem(item: TravelItem): TravelJsonExportItem {
  const output: TravelJsonExportItem = { type: item.type, name: item.name, date: item.date };
  addString(output, "category", item.category);
  addString(output, "area", item.area);
  addString(output, "businessHours", item.businessHours);
  addString(output, "closedDaysText", item.closedDaysText);
  if (item.closedRuleType !== null) output.closedRuleType = item.closedRuleType;
  if (item.closedRuleValues !== null) output.closedRuleValues = item.closedRuleValues;
  addString(output, "googleMapsUrl", item.googleMapsUrl);
  addString(output, "link1", item.extraLink1);
  addString(output, "link2", item.extraLink2);
  addString(output, "note", item.note);
  addString(output, "priceList", item.priceList);
  addString(output, "priceCheckedAt", item.priceCheckedAt);
  addString(output, "priceSource", item.priceSource);
  if (item.status !== null) output.status = item.status;
  if (item.rating !== null) output.rating = item.rating;
  addString(output, "completedDate", item.completedDate ?? undefined);
  addString(output, "consumedItems", item.consumedItems);
  addString(output, "experienceNote", item.experienceNote);
  return output;
}

function addString<K extends keyof TravelJsonExportItem>(output: TravelJsonExportItem, key: K, value: string | undefined) {
  if (value !== undefined && value !== "") output[key] = value as TravelJsonExportItem[K];
}

function compareDailyOrder(left: TravelItem, right: TravelItem) {
  return (left.date ?? "9999-99-99").localeCompare(right.date ?? "9999-99-99")
    || left.order - right.order
    || left.createdAt.localeCompare(right.createdAt);
}

function duplicateNames(items: TravelItem[]) {
  const groups = new Map<string, TravelJsonExportDuplicate>();
  for (const item of items) {
    const key = `${item.type}\u0000${item.name}`;
    const current = groups.get(key);
    groups.set(key, current ? { ...current, count: current.count + 1 } : { type: item.type, name: item.name, count: 1 });
  }
  return [...groups.values()].filter((group) => group.count > 1);
}

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
