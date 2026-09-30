declare const database: { execute(query: unknown): Promise<unknown> };

database.execute("database diagnostic query");
