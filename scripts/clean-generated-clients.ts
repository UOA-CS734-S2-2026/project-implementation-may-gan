import { rm } from "node:fs/promises";

async function cleanGeneratedClients() {
  await Promise.all([
    rm("packages/api-client-typescript", { force: true, recursive: true }),
    rm("packages/api-client-dart", { force: true, recursive: true }),
  ]);
}

cleanGeneratedClients().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
