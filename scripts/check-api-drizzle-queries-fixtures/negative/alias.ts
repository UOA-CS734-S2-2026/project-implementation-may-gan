declare const database: { execute(query: unknown): Promise<unknown> };

const runQuery = database.execute;
runQuery("aliased query");
