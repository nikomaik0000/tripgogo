"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ClampedNote({ note, lines, textClassName = "", linkify = false, showMarker = true, moreLabel = "+ More", lessLabel = "−", inlineExpand = false, hideMoreAction = false, onOverflowChange }: { note: string; lines: 1 | 2 | 3 | 4 | 5 | 10; textClassName?: string; linkify?: boolean; showMarker?: boolean; moreLabel?: string; lessLabel?: string; inlineMore?: boolean; inlineExpand?: boolean; hideMoreAction?: boolean; onOverflowChange?: (overflow: boolean) => void }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const onOverflowChangeRef = useRef(onOverflowChange);
  const [preview, setPreview] = useState<string>();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  onOverflowChangeRef.current = onOverflowChange;

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      if (!width) return;
      const computed = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.65;
      const measuring = element.cloneNode(false) as HTMLParagraphElement;
      measuring.removeAttribute("id");
      measuring.style.position = "fixed";
      measuring.style.visibility = "hidden";
      measuring.style.pointerEvents = "none";
      measuring.style.left = "-10000px";
      measuring.style.top = "0";
      measuring.style.width = `${width}px`;
      measuring.style.display = "block";
      measuring.style.overflow = "visible";
      measuring.style.fontFamily = computed.fontFamily;
      measuring.style.fontSize = computed.fontSize;
      measuring.style.fontStyle = computed.fontStyle;
      measuring.style.fontWeight = computed.fontWeight;
      measuring.style.letterSpacing = computed.letterSpacing;
      measuring.style.lineHeight = computed.lineHeight;
      measuring.style.overflowWrap = computed.overflowWrap;
      measuring.style.whiteSpace = computed.whiteSpace;
      measuring.style.wordBreak = computed.wordBreak;
      measuring.style.setProperty("-webkit-line-clamp", "unset");
      measuring.style.setProperty("-webkit-box-orient", "unset");
      document.body.appendChild(measuring);
      const units = linkify ? linkifiedMeasurementUnits(note) : Array.from(note).map((value) => ({ type: "text", value }) as const);
      const fits = (length: number, suffix = "") => {
        measuring.replaceChildren();
        for (const unit of units.slice(0, length)) {
          if (unit.type === "link") {
            const placeholder = document.createElement("span");
            placeholder.setAttribute("aria-hidden", "true");
            placeholder.style.display = "inline-block";
            placeholder.style.width = "1rem";
            placeholder.style.height = "1rem";
            placeholder.style.verticalAlign = "middle";
            measuring.appendChild(placeholder);
          } else {
            measuring.appendChild(document.createTextNode(unit.value));
          }
        }
        if (suffix) measuring.appendChild(document.createTextNode(suffix));
        return measuring.scrollHeight <= lineHeight * lines + 1;
      };
      if (fits(units.length)) {
        setPreview(undefined);
        onOverflowChangeRef.current?.(false);
      } else {
        const suffix = hideMoreAction ? "…" : `…  ${moreLabel}`;
        let low = 0;
        let high = units.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (fits(middle, suffix)) low = middle;
          else high = middle - 1;
        }
        setPreview(`${units.slice(0, low).map((unit) => unit.value).join("")}…`);
        onOverflowChangeRef.current?.(true);
      }
      measuring.remove();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hideMoreAction, linkify, moreLabel, note, lines]);

  useLayoutEffect(() => setExpanded(false), [note, lines]);

  return <>
    <div className={showMarker ? "grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 text-sm text-muted" : "min-w-0 text-sm text-muted"}>
      {showMarker && <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center leading-4">✦</span>}
      <p ref={textRef} className={`min-w-0 whitespace-pre-wrap break-words ${textClassName}`}>{linkify ? <LinkifiedText text={expanded || !preview ? note : preview} /> : expanded || !preview ? note : preview}{preview && !hideMoreAction && <> <button type="button" aria-label={expanded ? "收合備註" : "查看完整備註"} title={expanded ? "收合備註" : "查看完整備註"} onMouseDown={stopPropagation} onTouchStart={stopPropagation} onPointerDown={stopPropagation} onClick={() => inlineExpand ? setExpanded((value) => !value) : setOpen(true)} className="inline px-1 text-xs leading-[inherit] text-muted/90 transition-colors hover:text-muted">{expanded ? lessLabel : moreLabel}</button></>}</p>
    </div>
    {!inlineExpand && <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="備註">
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-ink">{linkify ? <LinkifiedText text={note} /> : note}</p>
      </DialogContent>
    </Dialog>}
  </>;
}

function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

const URL_PATTERN = /https?:\/\/[^\s，。！？；：（）【】《》]+/gi;
const TRAILING_PUNCTUATION = /[.,!?;:\])}，。！？；：）】》]+$/;

type LinkifiedSegment = { type: "text"; value: string } | { type: "link"; value: string };

export function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  for (const [index, segment] of linkifiedSegments(text).entries()) {
    if (segment.type === "link") {
      parts.push(<a key={`${index}-${segment.value}`} href={segment.value} target="_blank" rel="noopener noreferrer" aria-label="開啟連結" title="開啟連結" className="inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle leading-none text-muted transition-colors hover:text-[#555555]"><Link2 aria-hidden="true" className="h-4 w-4" /></a>);
    } else {
      parts.push(segment.value);
    }
  }
  return <>{parts}</>;
}

function linkifiedMeasurementUnits(text: string): LinkifiedSegment[] {
  const units: LinkifiedSegment[] = [];
  for (const segment of linkifiedSegments(text)) {
    if (segment.type === "link") units.push(segment);
    else units.push(...Array.from(segment.value).map((value): LinkifiedSegment => ({ type: "text", value })));
  }
  return units;
}

function linkifiedSegments(text: string): LinkifiedSegment[] {
  const segments: LinkifiedSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) segments.push({ type: "text", value: text.slice(cursor, index) });
    const candidate = match[0];
    const trailing = candidate.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = trailing ? candidate.slice(0, -trailing.length) : candidate;
    if (isSafeHttpUrl(href)) {
      segments.push({ type: "link", value: href });
      if (trailing) segments.push({ type: "text", value: trailing });
    } else {
      segments.push({ type: "text", value: candidate });
    }
    cursor = index + candidate.length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
