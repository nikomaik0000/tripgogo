"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ClampedNote({ note, lines, textClassName = "", linkify = false }: { note: string; lines: 2 | 3 | 4 | 10; textClassName?: string; linkify?: boolean }) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    const measure = () => setIsTruncated(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [note, lines]);

  return <>
    <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2 text-sm text-muted">
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center leading-4">✦</span>
      <div className="min-w-0">
        <p ref={textRef} className={`${lines === 2 ? "line-clamp-2" : lines === 3 ? "line-clamp-3" : lines === 4 ? "line-clamp-4" : "line-clamp-[10]"} min-w-0 whitespace-pre-wrap break-words ${textClassName}`}>{linkify ? <LinkifiedText text={note} /> : note}</p>
        {isTruncated && <button type="button" aria-label="查看完整備註" title="查看完整備註" onMouseDown={stopPropagation} onTouchStart={stopPropagation} onPointerDown={stopPropagation} onClick={() => setOpen(true)} className="mt-1 block text-xs leading-4 text-muted/90 transition-colors hover:text-muted">+ more</button>}
      </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="備註">
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-ink">{linkify ? <LinkifiedText text={note} /> : note}</p>
      </DialogContent>
    </Dialog>
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
      parts.push(<a key={`${index}-${href}`} href={href} target="_blank" rel="noopener noreferrer" aria-label="開啟備註連結" title="開啟外部連結" className="inline-flex h-5 w-5 shrink-0 items-center justify-center align-text-bottom text-muted transition-colors hover:text-ink"><Link2 aria-hidden="true" className="h-4 w-4" /></a>);
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
