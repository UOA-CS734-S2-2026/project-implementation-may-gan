import { OpenAPIHono } from "@hono/zod-openapi";
import { registerApiDocsRoute } from "./features/system/api-docs/route";
import { registerHealthRoute } from "./features/system/health/route";
import { registerTestContractsRoute } from "./features/system/test-contracts/route";

export const app = new OpenAPIHono({
  defaultHook: (result, context) => {
    if (!result.success) {
      return context.json(
        {
          error: {
            code: "VALIDATION_FAILED" as const,
            message: "The request contains invalid values.",
            requestId: crypto.randomUUID(),
            details: { issues: result.error.issues },
          },
        },
        422,
      );
    }
  },
});

registerHealthRoute(app);
registerTestContractsRoute(app);
registerApiDocsRoute(app);

app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Dayli API",
    version: "1.0.0",
    description: "REST API shared by the Dayli mobile and web clients.",
  },
});
