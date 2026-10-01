import { safeReturnPath } from "./safe-return-path";

export type RouteSearchParams = Record<string, string | string[] | undefined>;

/** Builds a destination from a fixed route pathname and framework page props. */
export function routeReturnPath(pathname: string, searchParams?: RouteSearchParams): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") query.append(name, value);
    else if (Array.isArray(value)) for (const item of value) query.append(name, item);
  }
  const result = `${pathname}${query.size ? `?${query}` : ""}`;
  return safeReturnPath(result, pathname);
}
