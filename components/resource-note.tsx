"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  appendLinkPlaceholder,
  CARD_NOTE_TYPOGRAPHY,
  ClampedNote,
  LinkifiedText,
  linkifiedSegments,
  type ClampedNoteFormattedRenderer,
} from "@/components/clamped-note";
import {
  normalizeResourceNoteSpans,
  parseResourceNote,
  resourceNoteRangeMatches,
  serializeResourceNote,
  updateResourceNoteRange,
  type ResourceNoteHighlight,
  type ResourceNoteSpan,
} from "@/lib/resource-note-format";
import { colors } from "@/lib/theme";

type SelectionRange = { start: number; end: number };
type FormatState = { bold: boolean; highlight?: ResourceNoteHighlight };

const HIGHLIGHT_LABELS: Record<ResourceNoteHighlight, string> = {
  yellow: "黃色螢光筆",
  pink: "粉色螢光筆",
  blue: "藍色螢光筆",
};

const HIGHLIGHT_COLORS = colors.resourceNoteHighlight;

export function ResourceClampedNote({ note, lines }: { note: string; lines: 1 | 2 | 3 | 4 | 5 | 10 }) {
  const parsed = useMemo(() => parseResourceNote(note), [note]);
  const formattedRenderer = useMemo<ClampedNoteFormattedRenderer | undefined>(() => parsed.hasFormatting ? {
    render: (text) => <FormattedResourceNoteText text={text} sourceText={parsed.text} spans={parsed.spans} />,
    appendToMeasurement: (container, text) => appendFormattedMeasurement(container, text, parsed.text, parsed.spans),
  } : undefined, [parsed]);

  return <ClampedNote
    note={parsed.text}
    lines={lines}
    linkify
    showMarker={false}
    textClassName={CARD_NOTE_TYPOGRAPHY}
    formattedRenderer={formattedRenderer}
  />;
}

export function ResourceNoteEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedValueRef = useRef<string | undefined>(undefined);
  const composingRef = useRef(false);
  const selectionRef = useRef<SelectionRange | undefined>(undefined);
  const [selection, setSelection] = useState<SelectionRange>();
  const [hint, setHint] = useState("");

  const updateSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = getSelectionOffsets(editor);
    selectionRef.current = next;
    setSelection((current) => rangesEqual(current, next) ? current : next);
    if (next && next.start < next.end) setHint("");
  }, []);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastEmittedValueRef.current) return;
    setEditorContent(editor, parseResourceNote(value).spans);
    lastEmittedValueRef.current = value;
    selectionRef.current = undefined;
    setSelection(undefined);
    setHint("");
  }, [value]);

  useEffect(() => {
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [updateSelection]);

  const emitCurrentValue = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = serializeResourceNote(readEditorSpans(editor));
    lastEmittedValueRef.current = next;
    onChange(next);
  }, [onChange]);

  const insertText = useCallback((text: string) => {
    const editor = editorRef.current;
    if (!editor || !text) return;
    editor.focus();
    insertPlainText(editor, text.replace(/\r\n?/g, "\n"));
    emitCurrentValue();
    updateSelection();
  }, [emitCurrentValue, updateSelection]);

  const applyFormat = useCallback((format: "bold" | ResourceNoteHighlight) => {
    const editor = editorRef.current;
    const selected = selectionRef.current;
    if (!editor || !selected || selected.start >= selected.end) {
      setHint("請先選取文字");
      return;
    }

    const spans = readEditorSpans(editor);
    const textLength = spans.reduce((length, span) => length + span.text.length, 0);
    const start = Math.max(0, Math.min(selected.start, textLength));
    const end = Math.max(start, Math.min(selected.end, textLength));
    if (start >= end) {
      setHint("請先選取文字");
      return;
    }

    const remove = format === "bold"
      ? resourceNoteRangeMatches(spans, start, end, (span) => Boolean(span.bold))
      : resourceNoteRangeMatches(spans, start, end, (span) => span.highlight === format);
    const next = updateResourceNoteRange(spans, start, end, (span) => {
      if (format === "bold") {
        const { bold: _bold, ...rest } = span;
        return remove ? rest : { ...rest, bold: true };
      }
      const { highlight: _highlight, ...rest } = span;
      return remove ? rest : { ...rest, highlight: format };
    });

    setEditorContent(editor, next);
    const nextValue = serializeResourceNote(next);
    lastEmittedValueRef.current = nextValue;
    onChange(nextValue);
    editor.focus();
    restoreSelection(editor, { start, end });
    selectionRef.current = { start, end };
    setSelection({ start, end });
    setHint("");
  }, [onChange]);

  const hasSelection = Boolean(selection && selection.start < selection.end);
  const activeFormats = useMemo(() => {
    if (!selection || selection.start >= selection.end) return { bold: false, highlight: undefined };
    const spans = parseResourceNote(value).spans;
    return {
      bold: resourceNoteRangeMatches(spans, selection.start, selection.end, (span) => Boolean(span.bold)),
      highlight: (Object.keys(HIGHLIGHT_LABELS) as ResourceNoteHighlight[]).find((color) => resourceNoteRangeMatches(spans, selection.start, selection.end, (span) => span.highlight === color)),
    };
  }, [selection, value]);
  const toolbarButtonClass = `flex h-11 min-w-11 items-center justify-center rounded-card px-2 text-xs text-ink transition-colors hover:bg-searchBackground sm:h-9 sm:min-w-9 ${hasSelection ? "" : "opacity-50"}`;

  return <div className="space-y-2">
    <div role="toolbar" aria-label="備忘文字格式" className="flex min-w-0 items-center gap-1">
      <button type="button" aria-label="切換粗體" aria-pressed={activeFormats.bold} title="粗體" onPointerDown={(event) => event.preventDefault()} onClick={() => applyFormat("bold")} className={`${toolbarButtonClass} font-semibold ${activeFormats.bold ? "bg-searchBackground outline outline-1 outline-muted" : ""}`}>B</button>
      {(Object.keys(HIGHLIGHT_LABELS) as ResourceNoteHighlight[]).map((color) => {
        const active = activeFormats.highlight === color;
        return <button
          key={color}
          type="button"
          aria-label={HIGHLIGHT_LABELS[color]}
          aria-pressed={active}
          title={HIGHLIGHT_LABELS[color]}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => applyFormat(color)}
          className={toolbarButtonClass}
        ><span aria-hidden="true" className={`h-4 w-6 rounded-[4px] border ${active ? "border-muted outline outline-1 outline-offset-2 outline-muted" : "border-border"}`} style={{ backgroundColor: HIGHLIGHT_COLORS[color] }} /></button>;
      })}
    </div>
    {hint && <p role="status" className="text-xs text-muted">{hint}</p>}
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="備忘內容"
      aria-multiline="true"
      className="form-control min-h-28 w-full whitespace-pre-wrap break-words rounded-card border border-border bg-surface px-3 py-2 text-sm leading-6 text-ink"
      onInput={() => { if (!composingRef.current) emitCurrentValue(); }}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={() => { composingRef.current = false; emitCurrentValue(); updateSelection(); }}
      onBeforeInput={(event) => {
        const inputType = (event.nativeEvent as InputEvent).inputType;
        if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
          event.preventDefault();
          insertText("\n");
        }
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
          event.preventDefault();
          applyFormat("bold");
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        insertText(event.clipboardData.getData("text/plain"));
      }}
      onDrop={(event) => {
        event.preventDefault();
        insertText(event.dataTransfer.getData("text/plain"));
      }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onMouseUp={updateSelection}
      onKeyUp={updateSelection}
      onTouchEnd={() => window.setTimeout(updateSelection, 0)}
    />
  </div>;
}

function FormattedResourceNoteText({ text, sourceText, spans }: { text: string; sourceText: string; spans: ResourceNoteSpan[] }) {
  const sourceLength = formattedSourceLength(text, sourceText);
  return <LinkifiedText text={text} renderText={(value, start, end) => renderStyledRange(spans, value, start, end, sourceLength)} />;
}

function renderStyledRange(spans: ResourceNoteSpan[], value: string, start: number, end: number, sourceLength: number) {
  const parts: React.ReactNode[] = [];
  const formattedEnd = Math.min(end, sourceLength);
  let cursor = 0;
  let spanStart = 0;

  for (const [index, span] of spans.entries()) {
    const spanEnd = spanStart + span.text.length;
    const selectedStart = Math.max(start, spanStart);
    const selectedEnd = Math.min(formattedEnd, spanEnd);
    if (selectedStart < selectedEnd) {
      const localStart = selectedStart - start;
      if (localStart > cursor) parts.push(value.slice(cursor, localStart));
      const localEnd = selectedEnd - start;
      parts.push(<ResourceNoteMark key={`${index}-${selectedStart}`} span={span}>{value.slice(localStart, localEnd)}</ResourceNoteMark>);
      cursor = localEnd;
    }
    spanStart = spanEnd;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

function ResourceNoteMark({ span, children }: { span: ResourceNoteSpan; children: ReactNode }) {
  let content = children;
  if (span.bold) content = <strong className="font-semibold">{content}</strong>;
  if (span.highlight) content = <mark className="text-inherit" style={{ backgroundColor: HIGHLIGHT_COLORS[span.highlight] }}>{content}</mark>;
  return <>{content}</>;
}

function appendFormattedMeasurement(container: HTMLElement, text: string, sourceText: string, spans: ResourceNoteSpan[]) {
  const sourceLength = formattedSourceLength(text, sourceText);
  for (const segment of linkifiedSegments(text)) {
    if (segment.type === "link") {
      appendLinkPlaceholder(container);
    } else {
      appendStyledMeasurementRange(container, spans, segment.value, segment.start, segment.end, sourceLength);
    }
  }
}

function appendStyledMeasurementRange(container: HTMLElement, spans: ResourceNoteSpan[], value: string, start: number, end: number, sourceLength: number) {
  const formattedEnd = Math.min(end, sourceLength);
  let cursor = 0;
  let spanStart = 0;
  for (const span of spans) {
    const spanEnd = spanStart + span.text.length;
    const selectedStart = Math.max(start, spanStart);
    const selectedEnd = Math.min(formattedEnd, spanEnd);
    if (selectedStart < selectedEnd) {
      const localStart = selectedStart - start;
      if (localStart > cursor) container.appendChild(document.createTextNode(value.slice(cursor, localStart)));
      const localEnd = selectedEnd - start;
      container.appendChild(createFormattedNode(value.slice(localStart, localEnd), span));
      cursor = localEnd;
    }
    spanStart = spanEnd;
  }
  if (cursor < value.length) container.appendChild(document.createTextNode(value.slice(cursor)));
}

function createFormattedNode(text: string, span: ResourceNoteSpan) {
  let node: Node = document.createTextNode(text);
  if (span.bold) {
    const strong = document.createElement("strong");
    strong.className = "font-semibold";
    strong.appendChild(node);
    node = strong;
  }
  if (span.highlight) {
    const mark = document.createElement("mark");
    mark.dataset.color = span.highlight;
    mark.style.backgroundColor = HIGHLIGHT_COLORS[span.highlight];
    mark.appendChild(node);
    node = mark;
  }
  return node;
}

function setEditorContent(editor: HTMLElement, spans: ResourceNoteSpan[]) {
  const fragment = document.createDocumentFragment();
  for (const span of normalizeResourceNoteSpans(spans)) fragment.appendChild(createFormattedNode(span.text, span));
  editor.replaceChildren(fragment);
}

function readEditorSpans(editor: HTMLElement) {
  const spans: ResourceNoteSpan[] = [];
  const nodes = Array.from(editor.childNodes);
  nodes.forEach((node, index) => {
    readEditorNode(node, { bold: false }, spans);
    if (index < nodes.length - 1 && node instanceof HTMLElement && (node.tagName === "DIV" || node.tagName === "P") && !lastSpanEndsWithNewline(spans)) {
      spans.push({ text: "\n" });
    }
  });
  return normalizeResourceNoteSpans(spans);
}

function readEditorNode(node: Node, format: FormatState, spans: ResourceNoteSpan[]) {
  const append = (text: string, nextFormat = format) => {
    if (!text) return;
    spans.push({ text, ...(nextFormat.bold ? { bold: true as const } : {}), ...(nextFormat.highlight ? { highlight: nextFormat.highlight } : {}) });
  };
  if (node.nodeType === Node.TEXT_NODE) {
    append(node.textContent ?? "");
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  if (node.tagName === "BR") {
    append("\n");
    return;
  }

  const markColor = node.dataset.color;
  const highlight = node.tagName === "MARK" && isResourceNoteHighlight(markColor) ? markColor : format.highlight;
  const next = { bold: format.bold || node.tagName === "STRONG" || node.tagName === "B", ...(highlight ? { highlight } : {}) };
  for (const child of Array.from(node.childNodes)) readEditorNode(child, next, spans);
}

function lastSpanEndsWithNewline(spans: ResourceNoteSpan[]) {
  return spans.at(-1)?.text.endsWith("\n") ?? false;
}

function insertPlainText(editor: HTMLElement, text: string) {
  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  editor.normalize();
}

function getSelectionOffsets(editor: HTMLElement): SelectionRange | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return undefined;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return undefined;
  const startRange = range.cloneRange();
  startRange.selectNodeContents(editor);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(editor);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { start: startRange.toString().length, end: endRange.toString().length };
}

function restoreSelection(editor: HTMLElement, selectionRange: SelectionRange) {
  const start = findTextPosition(editor, selectionRange.start);
  const end = findTextPosition(editor, selectionRange.end);
  if (!start || !end) return;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function findTextPosition(editor: HTMLElement, target: number) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent?.length ?? 0;
    if (target <= cursor + length) return { node, offset: target - cursor };
    cursor += length;
    node = walker.nextNode();
  }
  return target === 0 ? { node: editor, offset: 0 } : undefined;
}

function formattedSourceLength(text: string, sourceText: string) {
  if (text === sourceText) return sourceText.length;
  let length = 0;
  const limit = Math.min(text.length, sourceText.length);
  while (length < limit && text[length] === sourceText[length]) length += 1;
  return text.endsWith("…") ? Math.min(length, text.length - 1) : length;
}

function rangesEqual(first?: SelectionRange, second?: SelectionRange) {
  return first?.start === second?.start && first?.end === second?.end;
}

function isResourceNoteHighlight(value?: string): value is ResourceNoteHighlight {
  return value === "yellow" || value === "pink" || value === "blue";
}
