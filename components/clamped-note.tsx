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
      measuring.style.setProperty("-webkit-line-clamp", "unset");
      measuring.style.setProperty("-webkit-box-orient", "unset");
      document.body.appendChild(measuring);
      const fits = (value: string) => {
        measuring.textContent = value;
        return measuring.scrollHeight <= lineHeight * lines + 1;
      };
      if (fits(note)) {
        setPreview(undefined);
        onOverflowChangeRef.current?.(false);
      } else {
        const suffix = hideMoreAction ? "…" : `…  ${moreLabel}`;
        let low = 0;
        let high = note.length;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (fits(`${note.slice(0, middle).trimEnd()}${suffix}`)) low = middle;
          else high = middle - 1;
        }
        setPreview(`${note.slice(0, low).trimEnd()}…`);
        onOverflowChangeRef.current?.(true);
      }
      measuring.remove();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hideMoreAction, moreLabel, note, lines]);

  useLayoutEffect(() => setExpanded(false), [note, lines]);

  return <>
    <div className={showMarker ? "grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 text-sm text-muted" : "min-w-0 text-sm text-muted"}>
      {showMarker && <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center leading-4">✦</span>}
      <p ref={textRef} className={`min-w-0 whitespace-pre-wrap break-words ${textClassName}`}>{expanded || !preview ? (linkify ? <LinkifiedText text={note} /> : note) : preview}{preview && !hideMoreAction && <> <button type="button" aria-label={expanded ? "收合備註" : "查看完整備註"} title={expanded ? "收合備註" : "查看完整備註"} onMouseDown={stopPropagation} onTouchStart={stopPropagation} onPointerDown={stopPropagation} onClick={() => inlineExpand ? setExpanded((value) => !value) : setOpen(true)} className="inline px-1 text-xs leading-[inherit] text-muted/90 transition-colors hover:text-muted">{expanded ? lessLabel : moreLabel}</button></>}</p>
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

function LinkifiedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    const candidate = match[0];
    const trailing = candidate.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    const href = trailing ? candidate.slice(0, -trailing.length) : candidate;
    if (isSafeHttpUrl(href)) {
      parts.push(<a key={`${index}-${href}`} href={href} target="_blank" rel="noopener noreferrer" aria-label="開啟備註連結" title="開啟外部連結" className="inline-flex h-5 w-5 shrink-0 items-center justify-center align-text-bottom text-muted transition-colors hover:text-[#555555]"><Link2 aria-hidden="true" className="h-4 w-4" /></a>);
      if (trailing) parts.push(trailing);
    } else {
      parts.push(candidate);
    }
    cursor = index + candidate.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
