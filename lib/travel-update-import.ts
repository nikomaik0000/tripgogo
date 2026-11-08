import type { TravelImportItem, TravelImportPreview } from "@/lib/travel-import";
import type { TravelItem } from "@/lib/types";

export type TravelUpdateResolution =
  | { kind: "add"; confirmed: boolean }
  | { kind: "update"; existingId: string; confirmed: boolean }
  | { kind: "skip"; confirmed: boolean };

export type TravelUpdateAnalysisRow = {
  index: number;
  item: TravelImportItem;
  providedFields: string[];
  sourceValues: Record<string, unknown>;
  requiresManualMatch: boolean;
  reason?: string;
  suggestedIds: string[];
  defaultResolution: TravelUpdateResolution;
};

export type TravelUpdateDiff = {
  field: string;
  label: string;
  before: string;
  after: string;
};

export type TravelUpdateOperation =
  | { index: number; action: "add"; item: TravelImportItem }
  | { index: number; action: "update"; itemId: string; patch: Record<string, unknown> };

export type TravelUpdateOptions = {
  allowUnscheduledAdds?: boolean;
  requireCrossTypeNameConfirmation?: boolean;
  workspaceLabel?: string;
};

type FieldDefinition = {
  label: string;
  current: (item: TravelItem) => unknown;
  incoming: (item: TravelImportItem) => unknown;
  clearValue: unknown;
  empty: (value: unknown) => boolean;
};

const textEmpty = (value: unknown) => value === "" || value === null || value === undefined;
const nullableEmpty = (value: unknown) => value === null || value === undefined || value === "";

const FIELD_DEFINITIONS: Record<string, FieldDefinition> = {
  type: { label: "類型", current: (item) => item.type, incoming: (item) => item.type, clearValue: null, empty: () => false },
  category: { label: "分類", current: (item) => item.category, incoming: (item) => item.category, clearValue: "", empty: textEmpty },
  area: { label: "地區", current: (item) => item.area, incoming: (item) => item.area, clearValue: "", empty: textEmpty },
  date: { label: "日期", current: (item) => item.date, incoming: (item) => item.date, clearValue: null, empty: nullableEmpty },
  name: { label: "名稱", current: (item) => item.name, incoming: (item) => item.name, clearValue: null, empty: () => false },
  googleMapsUrl: { label: "Google Maps", current: (item) => item.googleMapsUrl, incoming: (item) => item.googleMapsUrl, clearValue: "", empty: textEmpty },
  link1: { label: "連結 1", current: (item) => item.extraLink1, incoming: (item) => item.link1, clearValue: null, empty: textEmpty },
  link2: { label: "連結 2", current: (item) => item.extraLink2, incoming: (item) => item.link2, clearValue: null, empty: textEmpty },
  businessHours: { label: "營業時間", current: (item) => item.businessHours, incoming: (item) => item.businessHours, clearValue: null, empty: textEmpty },
  closedDaysText: { label: "店休日", current: (item) => item.closedDaysText, incoming: (item) => item.closedDaysText, clearValue: null, empty: textEmpty },
  closedRuleType: { label: "店休日規則", current: (item) => item.closedRuleType, incoming: (item) => item.closedRuleType, clearValue: null, empty: nullableEmpty },
  closedRuleValues: { label: "店休日設定", current: (item) => item.closedRuleValues, incoming: (item) => item.closedRuleValues, clearValue: null, empty: nullableEmpty },
  note: { label: "備註", current: (item) => item.note, incoming: (item) => item.note, clearValue: "", empty: textEmpty },
  priceList: { label: "價目表", current: (item) => item.priceList, incoming: (item) => item.priceList, clearValue: null, empty: textEmpty },
  priceCheckedAt: { label: "價目確認日", current: (item) => item.priceCheckedAt, incoming: (item) => item.priceCheckedAt, clearValue: null, empty: nullableEmpty },
  priceSource: { label: "價格來源", current: (item) => item.priceSource, incoming: (item) => item.priceSource, clearValue: null, empty: textEmpty },
  status: { label: "收藏狀態", current: (item) => item.status, incoming: (item) => item.status, clearValue: null, empty: nullableEmpty },
  rating: { label: "評分", current: (item) => item.rating, incoming: (item) => item.rating, clearValue: null, empty: nullableEmpty },
  completedDate: { label: "實際造訪日期", current: (item) => item.completedDate, incoming: (item) => item.completedDate, clearValue: null, empty: nullableEmpty },
  consumedItems: { label: "消費品項", current: (item) => item.consumedItems, incoming: (item) => item.consumedItems, clearValue: null, empty: textEmpty },
  experienceNote: { label: "心得", current: (item) => item.experienceNote, incoming: (item) => item.experienceNote, clearValue: null, empty: textEmpty },
};

const ALWAYS_PROVIDED = new Set(["type", "name"]);
const NEVER_CLEAR_FIELDS = new Set(["type", "name", "date", "status"]);

export function analyzeTravelUpdate(preview: TravelImportPreview, existingItems: TravelItem[], options: TravelUpdateOptions = {}): TravelUpdateAnalysisRow[] {
  const validRows = preview.rows.filter((row): row is typeof row & { item: TravelImportItem } => Boolean(row.item) && row.errors.length === 0);
  const sourceNameCounts = new Map<string, number>();
  const sourceAnyTypeNameCounts = new Map<string, number>();
  for (const row of validRows) {
    const key = `${row.item.type}:${row.item.name}`;
    sourceNameCounts.set(key, (sourceNameCounts.get(key) ?? 0) + 1);
    sourceAnyTypeNameCounts.set(row.item.name, (sourceAnyTypeNameCounts.get(row.item.name) ?? 0) + 1);
  }

  return validRows.map((row) => {
    const sameName = existingItems.filter((item) => item.name === row.item.name);
    const exact = sameName.filter((item) => item.type === row.item.type);
    const similar = existingItems.filter((item) => isSimilarName(item.name, row.item.name));
    const duplicateSourceName = (sourceNameCounts.get(`${row.item.type}:${row.item.name}`) ?? 0) > 1;
    const crossTypeSourceName = options.requireCrossTypeNameConfirmation
      && !duplicateSourceName
      && (sourceAnyTypeNameCounts.get(row.item.name) ?? 0) > 1;

    if (!duplicateSourceName && !crossTypeSourceName && sameName.length === 1 && exact.length === 1) {
      return {
        index: row.index,
        item: row.item,
        providedFields: row.providedFields ?? [],
        sourceValues: row.sourceValues ?? {},
        requiresManualMatch: false,
        suggestedIds: [exact[0].id],
        defaultResolution: { kind: "update", existingId: exact[0].id, confirmed: true },
      };
    }

    if (!duplicateSourceName && !crossTypeSourceName && sameName.length === 0 && similar.length === 0) {
      if (row.item.date === null && !options.allowUnscheduledAdds) {
        return {
          index: row.index,
          item: row.item,
          providedFields: row.providedFields ?? [],
          sourceValues: row.sourceValues ?? {},
          requiresManualMatch: true,
          reason: "未排日期項目不可直接新增，請指定既有項目或略過",
          suggestedIds: [],
          defaultResolution: { kind: "skip", confirmed: false },
        };
      }
      return {
        index: row.index,
        item: row.item,
        providedFields: row.providedFields ?? [],
        sourceValues: row.sourceValues ?? {},
        requiresManualMatch: false,
        suggestedIds: [],
        defaultResolution: { kind: "add", confirmed: true },
      };
    }

    const reason = duplicateSourceName
      ? "JSON 中有多筆同名同類型項目"
      : crossTypeSourceName
        ? "JSON 中有跨類型同名項目"
      : sameName.length > 1
        ? `目前${options.workspaceLabel ?? "旅程"}有多筆同名項目`
        : sameName.length === 1
          ? "同名項目的類型不同"
          : "找到名稱相似的既有項目";
    return {
      index: row.index,
      item: row.item,
      providedFields: row.providedFields ?? [],
      sourceValues: row.sourceValues ?? {},
      requiresManualMatch: true,
      reason,
      suggestedIds: [...new Set([...sameName, ...similar].map((item) => item.id))],
      defaultResolution: { kind: "skip", confirmed: false },
    };
  });
}

export function emptyProvidedFields(row: TravelUpdateAnalysisRow) {
  return row.providedFields.flatMap((field) => {
    const definition = FIELD_DEFINITIONS[field];
    const empty = definition
      && !NEVER_CLEAR_FIELDS.has(field)
      && field !== "closedRuleType"
      && field !== "closedRuleValues"
      && definition.empty(definition.incoming(row.item));
    if (!empty) return [];
    return [{ field, sourceKind: row.sourceValues[field] === null ? "null" as const : "empty" as const }];
  });
}

export function fieldLabel(field: string) {
  return FIELD_DEFINITIONS[field]?.label ?? field;
}

export function buildTravelUpdatePatch(row: TravelUpdateAnalysisRow, existing: TravelItem, clearFields: ReadonlySet<string>) {
  const patch: Record<string, unknown> = {};
  const diffs: TravelUpdateDiff[] = [];
  const provided = new Set(row.providedFields);

  for (const [field, definition] of Object.entries(FIELD_DEFINITIONS)) {
    const incoming = definition.incoming(row.item);
    const shouldClear = clearFields.has(field) && provided.has(field) && definition.empty(incoming);
    const shouldApply = ALWAYS_PROVIDED.has(field) || (provided.has(field) && !definition.empty(incoming));
    if (!shouldClear && !shouldApply) continue;
    const next = shouldClear ? definition.clearValue : incoming;
    const current = definition.current(existing);
    if (equalValue(current, next)) continue;
    patch[field] = next;
    diffs.push({ field, label: definition.label, before: displayValue(current), after: displayValue(next) });
  }

  return { patch, diffs, movedDate: Object.prototype.hasOwnProperty.call(patch, "date") };
}

export function buildTravelUpdateOperations(
  rows: TravelUpdateAnalysisRow[],
  existingItems: TravelItem[],
  resolutions: ReadonlyMap<number, TravelUpdateResolution>,
  clearFields: ReadonlyMap<number, ReadonlySet<string>>,
  options: TravelUpdateOptions = {},
) {
  const operations: TravelUpdateOperation[] = [];
  for (const row of rows) {
    const resolution = resolutions.get(row.index) ?? row.defaultResolution;
    if (resolution.kind === "skip") continue;
    if (resolution.kind === "add") {
      if (row.item.date === null && !options.allowUnscheduledAdds) continue;
      operations.push({ index: row.index, action: "add", item: row.item });
      continue;
    }
    const existing = existingItems.find((item) => item.id === resolution.existingId);
    if (!existing) continue;
    const { patch } = buildTravelUpdatePatch(row, existing, clearFields.get(row.index) ?? new Set());
    if (Object.keys(patch).length > 0) operations.push({ index: row.index, action: "update", itemId: existing.id, patch });
  }
  return operations;
}

function normalizeName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

function isSimilarName(left: string, right: string) {
  if (left === right) return false;
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return false;
  return a === b || (Math.min(a.length, b.length) >= 2 && (a.includes(b) || b.includes(a)));
}

function equalValue(left: unknown, right: unknown) {
  const normalize = (value: unknown) => value === undefined || value === "" ? null : value;
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "（空白）";
  if (Array.isArray(value)) return value.length ? value.join("、") : "（空陣列）";
  if (value === "place") return "景點";
  if (value === "food") return "美食";
  return String(value);
}
