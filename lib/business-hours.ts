import { isClosedOnDate } from "@/lib/closed-days";
import type { ClosedRuleType, ClosedRuleValue } from "@/lib/types";

export type BusinessStatus = "open" | "closing-soon" | "closed";

type BusinessStatusOptions = {
  currentDate?: Date;
  closedRuleType?: ClosedRuleType | null;
  closedRuleValues?: ClosedRuleValue[] | null;
};

const HOURS_PATTERN = /^(\d{2}):(\d{2})\s*[-–～~]\s*(\d{2}):(\d{2})$/;

export function getBusinessStatus(
  businessHours: string | undefined,
  options: Date | BusinessStatusOptions = {}
): BusinessStatus | undefined {
  const currentDate = options instanceof Date ? options : options.currentDate ?? new Date();
  const closedRuleType = options instanceof Date ? null : options.closedRuleType;
  const closedRuleValues = options instanceof Date ? null : options.closedRuleValues;
  if (isClosedOnDate(closedRuleType, closedRuleValues, currentDate)) return "closed";

  const value = businessHours?.trim();
  if (!value) return undefined;
  if (value === "24 小時") return "open";

  const match = HOURS_PATTERN.exec(value);
  if (!match) return undefined;

  const [, openingHour, openingMinute, closingHour, closingMinute] = match;
  const opening = toMinutes(openingHour, openingMinute);
  const closing = toMinutes(closingHour, closingMinute);
  if (opening === undefined || closing === undefined || opening === closing) return undefined;

  const now = currentDate.getHours() * 60 + currentDate.getMinutes();
  const crossesMidnight = closing < opening;
  const isOpen = crossesMidnight ? now >= opening || now < closing : now >= opening && now < closing;
  if (!isOpen) return "closed";

  const minutesUntilClose = crossesMidnight
    ? (closing - now + 24 * 60) % (24 * 60)
    : closing - now;
  return minutesUntilClose <= 60 ? "closing-soon" : "open";
}

function toMinutes(hour: string, minute: string) {
  const hours = Number(hour);
  const minutes = Number(minute);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return undefined;
  }
  return hours * 60 + minutes;
}
