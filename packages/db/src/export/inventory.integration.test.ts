import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { exportDataInventory, validateExportInventory, validateExportJsonFamilies } from "./inventory";

const configuredUrl = process.env.TEST_DATABASE_URL;
const port = process.env.VERIFY_POSTGRES_PORT ?? "5433";
function localMigratorUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "localhost" || url.port !== port || url.pathname !== "/dayli_test"
    || url.username !== "migrator") {
    throw new Error("Export inventory tests require migrator on a disposable localhost dayli_test database.");
  }
  return value;
}

(configuredUrl ? describe : describe.skip)("migrated export inventory", () => {
  const client = postgres(localMigratorUrl(configuredUrl ?? `postgresql://migrator:migrator@localhost:${port}/dayli_test`),
    { max: 1, prepare: false });
  afterAll(async () => client.end({ timeout: 5 }));

  it("matches every migrated public table and column, including migrations outside Drizzle snapshots", async () => {
    const rows = await client<{ table_name: string; column_name: string }[]>`
      select columns.table_name, columns.column_name
      from information_schema.columns as columns
      join information_schema.tables as tables
        on tables.table_schema = columns.table_schema and tables.table_name = columns.table_name
      where columns.table_schema = 'public' and tables.table_type = 'BASE TABLE'
      order by columns.table_name, columns.ordinal_position
    `;
    const actual: Record<string, string[]> = {};
    for (const row of rows) (actual[row.table_name] ??= []).push(row.column_name);
    expect(Object.keys(actual).length).toBeGreaterThanOrEqual(40);
    expect(validateExportInventory(actual)).toEqual([]);
    expect(Object.keys(exportDataInventory).sort()).toEqual(Object.keys(actual).sort());
  });

  it("detects every migrated JSON family and rejects unknown revision keys", async () => {
    const columns = await client<{ table_name: string; column_name: string }[]>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and data_type in ('json', 'jsonb')
    `;
    expect(validateExportJsonFamilies(columns.map((row) => `${row.table_name}.${row.column_name}`))).toEqual([]);
    const [validation] = await client<{ valid: boolean; unknown: boolean }[]>`
      select public.dayli_attachment_refs_valid('[{"media_id":"synthetic","attachment_order":0,"status":"attached"}]'::jsonb) as valid,
        public.dayli_attachment_refs_valid('[{"media_id":"synthetic","attachment_order":0,"status":"attached","secret":"leak"}]'::jsonb) as unknown
    `;
    expect(validation).toMatchObject({ valid: true, unknown: false });
  });
});
