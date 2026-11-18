import { formatNumber } from "./display.js";
import { evaluateFormula, type VarScope } from "./formula.js";
import type { TableColumn, TableRow } from "../schema/table.js";

export type SortDirection = "asc" | "desc";

export interface TableSort {
  key: string;
  direction: SortDirection;
}

/** Resolves a literal cell or a derived column formula against the row and current scope. */
export function resolveCell(row: TableRow, column: TableColumn, scope: VarScope): string | number {
  if (!column.formula) return row.values[column.key] ?? "";
  const local: VarScope = { ...scope };
  for (const [key, value] of Object.entries(row.values)) local[key] = value;
  const result = evaluateFormula(column.formula, local);
  if (result === null) return "";
  return typeof result === "number" || typeof result === "string" || typeof result === "boolean"
    ? typeof result === "boolean" ? String(result) : result
    : "";
}

export function formatCell(value: string | number, precision?: number): string {
  if (typeof value === "number") return formatNumber(value, precision);
  return value;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function filterTableRows(
  rows: readonly TableRow[],
  query: string,
  filterKey?: string,
  status?: string,
): TableRow[] {
  const needle = query.trim().toLowerCase();
  const active = status && status !== "All" ? status : undefined;
  return rows.filter((row) => {
    if (active && filterKey && String(row.values[filterKey] ?? "") !== active) return false;
    if (!needle) return true;
    return Object.values(row.values).some((value) => String(value).toLowerCase().includes(needle));
  });
}

export function sortTableRows(
  rows: readonly TableRow[],
  columns: readonly TableColumn[],
  sort: TableSort | null,
  scope: VarScope = {},
): TableRow[] {
  if (!sort) return [...rows];
  const column = columns.find((candidate) => candidate.key === sort.key);
  if (!column || column.sortable === false) return [...rows];
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => direction * compareValues(
    resolveCell(a, column, scope),
    resolveCell(b, column, scope),
  ));
}

export function statusValues(rows: readonly TableRow[], key: string | undefined, explicit?: readonly string[]): string[] {
  if (!key) return [];
  if (explicit?.length) return [...explicit];
  const values = new Set<string>();
  for (const row of rows) {
    const value = row.values[key];
    if (value !== undefined && String(value).trim()) values.add(String(value));
  }
  return [...values].slice(0, 6);
}
