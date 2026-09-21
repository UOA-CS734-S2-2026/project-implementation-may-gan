-- squawk-ignore-file prefer-robust-stmts
-- squawk-ignore-file prefer-bigint-over-int
-- The migration runner applies this new table atomically. IF NOT EXISTS could conceal an incompatible partial table.
-- Better Auth 1.7.5's Drizzle schema requires a 32-bit integer count. Each configured window is at most 10 requests.
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rateLimit_key_unique" UNIQUE("key")
);
