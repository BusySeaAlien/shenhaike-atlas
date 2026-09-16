export interface DateBounds {
  start: string;
  end: string;
}

export function isPartialDate(value: string): boolean {
  if (/^\d{4}$/.test(value)) return Number(value) >= 1;
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month) return Number(month[1]) >= 1 && Number(month[2]) >= 1 && Number(month[2]) <= 12;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!day) return false;
  const year = Number(day[1]);
  const monthNumber = Number(day[2]);
  const dayNumber = Number(day[3]);
  if (year < 1 || monthNumber < 1 || monthNumber > 12 || dayNumber < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dayNumber <= days[monthNumber - 1];
}

export function dateBounds(value: string): DateBounds {
  if (!isPartialDate(value)) throw new Error(`Invalid partial date: ${value}`);
  if (value.length === 4) return { start: `${value}-01-01`, end: `${value}-12-31` };
  if (value.length === 7) {
    const [year, month] = value.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${value}-01`, end: `${value}-${String(lastDay).padStart(2, "0")}` };
  }
  return { start: value, end: value };
}

export function dateRangesOverlap(left: string, rightStart: string, rightEnd: string): boolean {
  const leftBounds = dateBounds(left);
  return leftBounds.end >= dateBounds(rightStart).start && leftBounds.start <= dateBounds(rightEnd).end;
}

export function inclusiveDayCount(startDate: string, endDate: string): number | null {
  if (startDate.length !== 10 || endDate.length !== 10) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function yearFromDate(date: string): string {
  return date.slice(0, 4);
}

export function monthFromDate(date: string): string {
  return date.slice(0, 7);
}
