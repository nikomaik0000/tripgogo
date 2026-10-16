export const RESOURCE_NOTE_PREFIX = "__TG_RESOURCE_NOTE_V1__";

export type ResourceNoteHighlight = "yellow" | "pink" | "blue";

export type ResourceNoteSpan = {
  text: string;
  bold?: true;
  highlight?: ResourceNoteHighlight;
};

export type ParsedResourceNote = {
  text: string;
  spans: ResourceNoteSpan[];
  structured: boolean;
  hasFormatting: boolean;
};

type ResourceNotePayload = {
  version: 1;
  spans: ResourceNoteSpan[];
};

const HIGHLIGHTS = new Set<ResourceNoteHighlight>(["yellow", "pink", "blue"]);
const PAYLOAD_KEYS = new Set(["version", "spans"]);
const SPAN_KEYS = new Set(["text", "bold", "highlight"]);

export function parseResourceNote(value = ""): ParsedResourceNote {
  if (!value.startsWith(RESOURCE_NOTE_PREFIX)) return plainResourceNote(value);

  try {
    const payload = JSON.parse(value.slice(RESOURCE_NOTE_PREFIX.length)) as unknown;
    if (!isResourceNotePayload(payload)) return plainResourceNote(value);
    const spans = normalizeResourceNoteSpans(payload.spans);
    return {
      text: spans.map((span) => span.text).join(""),
      spans,
      structured: true,
      hasFormatting: spans.some((span) => span.bold || span.highlight),
    };
  } catch {
    return plainResourceNote(value);
  }
}

export function serializeResourceNote(spans: ResourceNoteSpan[], trim = false) {
  const normalized = trim ? trimResourceNoteSpans(spans) : normalizeResourceNoteSpans(spans);
  const text = normalized.map((span) => span.text).join("");
  if (!normalized.some((span) => span.bold || span.highlight)) return text;
  const payload: ResourceNotePayload = { version: 1, spans: normalized };
  return `${RESOURCE_NOTE_PREFIX}${JSON.stringify(payload)}`;
}

export function normalizeResourceNoteValue(value: string) {
  return serializeResourceNote(parseResourceNote(value).spans, true);
}

export function extractResourceNotePlainText(value?: string) {
  return parseResourceNote(value).text;
}

export function normalizeResourceNoteSpans(spans: ResourceNoteSpan[]) {
  const normalized: ResourceNoteSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const next: ResourceNoteSpan = {
      text: span.text,
      ...(span.bold ? { bold: true as const } : {}),
      ...(span.highlight && HIGHLIGHTS.has(span.highlight) ? { highlight: span.highlight } : {}),
    };
    const previous = normalized.at(-1);
    if (previous && previous.bold === next.bold && previous.highlight === next.highlight) {
      previous.text += next.text;
    } else {
      normalized.push(next);
    }
  }
  return normalized;
}

export function updateResourceNoteRange(
  spans: ResourceNoteSpan[],
  start: number,
  end: number,
  update: (span: ResourceNoteSpan) => ResourceNoteSpan,
) {
  if (start >= end) return normalizeResourceNoteSpans(spans);
  const next: ResourceNoteSpan[] = [];
  let cursor = 0;

  for (const span of normalizeResourceNoteSpans(spans)) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    const selectedStart = Math.max(start, spanStart);
    const selectedEnd = Math.min(end, spanEnd);

    if (selectedStart >= selectedEnd) {
      next.push(span);
    } else {
      const before = span.text.slice(0, selectedStart - spanStart);
      const selected = span.text.slice(selectedStart - spanStart, selectedEnd - spanStart);
      const after = span.text.slice(selectedEnd - spanStart);
      if (before) next.push({ ...span, text: before });
      next.push(update({ ...span, text: selected }));
      if (after) next.push({ ...span, text: after });
    }
    cursor = spanEnd;
  }

  return normalizeResourceNoteSpans(next);
}

export function resourceNoteRangeMatches(
  spans: ResourceNoteSpan[],
  start: number,
  end: number,
  matches: (span: ResourceNoteSpan) => boolean,
) {
  if (start >= end) return false;
  let cursor = 0;
  let found = false;
  for (const span of normalizeResourceNoteSpans(spans)) {
    const spanEnd = cursor + span.text.length;
    if (Math.max(start, cursor) < Math.min(end, spanEnd)) {
      found = true;
      if (!matches(span)) return false;
    }
    cursor = spanEnd;
  }
  return found;
}

function plainResourceNote(text: string): ParsedResourceNote {
  const spans = text ? [{ text }] : [];
  return { text, spans, structured: false, hasFormatting: false };
}

function isResourceNotePayload(value: unknown): value is ResourceNotePayload {
  if (!isRecord(value) || !hasOnlyKeys(value, PAYLOAD_KEYS) || value.version !== 1 || !Array.isArray(value.spans)) return false;
  return value.spans.every((span) => {
    if (!isRecord(span) || !hasOnlyKeys(span, SPAN_KEYS) || typeof span.text !== "string") return false;
    if (span.bold !== undefined && typeof span.bold !== "boolean") return false;
    return span.highlight === undefined || (typeof span.highlight === "string" && HIGHLIGHTS.has(span.highlight as ResourceNoteHighlight));
  });
}

function trimResourceNoteSpans(spans: ResourceNoteSpan[]) {
  const normalized = normalizeResourceNoteSpans(spans);
  const text = normalized.map((span) => span.text).join("");
  const trimmedStart = text.trimStart();
  const start = text.length - trimmedStart.length;
  const end = start + trimmedStart.trimEnd().length;
  if (start === 0 && end === text.length) return normalized;
  if (start >= end) return [];
  return sliceResourceNoteSpans(normalized, start, end);
}

function sliceResourceNoteSpans(spans: ResourceNoteSpan[], start: number, end: number) {
  const result: ResourceNoteSpan[] = [];
  let cursor = 0;
  for (const span of spans) {
    const spanEnd = cursor + span.text.length;
    const selectedStart = Math.max(start, cursor);
    const selectedEnd = Math.min(end, spanEnd);
    if (selectedStart < selectedEnd) {
      result.push({ ...span, text: span.text.slice(selectedStart - cursor, selectedEnd - cursor) });
    }
    cursor = spanEnd;
  }
  return normalizeResourceNoteSpans(result);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}
