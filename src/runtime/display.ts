export function formatNumber(value: number, precision?: number): string {
  return precision === undefined ? String(Math.round(value * 100) / 100) : value.toFixed(precision);
}
