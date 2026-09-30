declare const database: { execute(query: unknown): Promise<unknown> };

database.execute("feature query");
