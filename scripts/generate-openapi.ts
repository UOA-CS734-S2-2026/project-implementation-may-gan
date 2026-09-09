import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { app } from "../apps/api/src/app";

async function generateOpenApi() {
  const outputPath = resolve("packages/contracts/openapi.json");
  const response = await app.request("http://localhost/api/v1/openapi.json");

  if (!response.ok) {
    throw new Error(`Could not generate OpenAPI document: ${response.status}`);
  }

  const document = await response.json();
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
}

generateOpenApi().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
