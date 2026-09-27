# @dayli/api-client

Generated TypeScript Fetch client for the Dayli API. Do not edit this package by hand.

## Usage

Pass the API URL explicitly when the application starts:

```ts
import { Configuration, SystemApi } from "@dayli/api-client";

const configuration = new Configuration({
  basePath: process.env.NEXT_PUBLIC_API_BASE_URL,
  credentials: "include",
});
const systemApi = new SystemApi(configuration);
const health = await systemApi.systemHealth();
```

Do not rely on the generator's localhost fallback. The application configuration owns the URL and authentication settings.

Regenerate this package from the repository root with `pnpm generate:clients`.
