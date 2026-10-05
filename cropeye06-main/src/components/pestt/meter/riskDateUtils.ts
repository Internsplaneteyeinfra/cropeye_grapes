const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ALIASES: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  ari: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function monthIndex(value: string): number | null {
  const token = value.trim().toLowerCase();
  if (token === "to" || token === "and") return null;
  const prefix = token.slice(0, 3);
  return Object.prototype.hasOwnProperty.call(MONTH_ALIASES, prefix)
    ? MONTH_ALIASES[prefix]
    : null;
}

export function isMonthInRanges(ranges: string[], month: string): boolean {
  const target = monthIndex(month);
  if (target == null) return false;

  return ranges.some((range) =>
    range.split(/[;,]/).some((segment) => {
      const indices = (segment.match(/[a-z]+/gi) ?? [])
        .map(monthIndex)
        .filter((index): index is number => index !== null);
      if (indices.length === 0) return false;
      if (indices.length === 1) return indices[0] === target;

      const [start, end] = indices;
      return start <= end
        ? target >= start && target <= end
        : target >= start || target <= end;
    }),
  );
}

export function monthNameForDate(value: string): string {
  const dateOnly = value.split("T", 1)[0];
  const date = new Date(`${dateOnly}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : MONTHS[date.getMonth()];
}

export function daysBetweenDates(startValue: string, endValue: string): number {
  const start = new Date(`${startValue.split("T", 1)[0]}T00:00:00Z`);
  const end = new Date(`${endValue.split("T", 1)[0]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}