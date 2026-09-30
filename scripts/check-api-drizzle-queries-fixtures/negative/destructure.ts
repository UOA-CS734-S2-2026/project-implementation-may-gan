declare const database: { execute(query: unknown): Promise<unknown> };

const { execute: runQuery } = database;
runQuery("destructured query");
