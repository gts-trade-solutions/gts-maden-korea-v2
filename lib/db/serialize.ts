// Prisma returns BigInt (counts), Decimal (prices) and Date objects that
// JSON.stringify can't handle (BigInt throws; Decimal/Date serialize oddly).
// jsonSafe() deep-converts a query result into plain JSON-friendly values:
//   BigInt  -> Number      (counts fit safely)
//   Decimal -> Number      (e.g. price 199.00 -> 199)
//   Date    -> ISO string
// JSON columns (already plain objects/arrays) pass through unchanged.
export function jsonSafe<T>(value: T): any {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString();
    const v = value as any;
    // Prisma Decimal — detected by duck-typing because Prisma minifies the
    // class name (it shows up as "i", not "Decimal").
    if (typeof v.toNumber === "function") return v.toNumber();
    if (Array.isArray(value)) return value.map(jsonSafe);
    const out: Record<string, any> = {};
    for (const key in v) out[key] = jsonSafe(v[key]);
    return out;
  }
  return value;
}
