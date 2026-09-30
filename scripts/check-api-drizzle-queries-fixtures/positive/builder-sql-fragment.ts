declare const database: { select(selection: unknown): { from(table: unknown): Promise<unknown> } };
declare const table: unknown;
declare function sql<T>(strings: TemplateStringsArray): T;

database.select({ count: sql<number>`count(*)` }).from(table);
