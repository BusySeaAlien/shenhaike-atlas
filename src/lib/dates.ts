export function inclusiveDayCount(startDate: string, endDate: string): number {
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
