import { CalendarDays, MapPin } from "lucide-react";

export function EmptyState({
  title = "沒有符合的優惠",
  description = "試著調整搜尋關鍵字或篩選條件，或直接新增一筆優惠。",
  icon = "calendar",
}: {
  title?: string;
  description?: string;
  icon?: "calendar" | "map";
}) {
  const Icon = icon === "map" ? MapPin : CalendarDays;
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border py-16 text-center">
      <Icon className="h-8 w-8 text-muted" strokeWidth={1.5} />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
