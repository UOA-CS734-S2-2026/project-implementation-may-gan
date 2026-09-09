import { Hono } from "hono";

export const app = new Hono().basePath("/api/v1");

app.get("/health", (context) =>
  context.json({ status: "ok", service: "dayli-api" }),
);

export default app;
