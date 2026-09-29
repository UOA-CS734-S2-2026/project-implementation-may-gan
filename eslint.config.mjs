import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.wrangler/**",
      "apps/web/**",
      "packages/api-client-dart/**",
      "packages/api-client-typescript/**",
      "**/coverage/**",
      "**/*.boundary-fixture.ts",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: [
      "apps/api/src/features/**/service.ts",
      "apps/api/src/features/**/*.service.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["hono", "hono/**", "@hono/**"],
              message: "Services must not depend on Hono.",
            },
            {
              group: ["wrangler", "@cloudflare/**"],
              message: "Services must not depend on the Cloudflare runtime.",
            },
            {
              group: ["**/route", "**/route.*", "**/*.route", "**/*.route.*"],
              message: "Services must not import HTTP routes.",
            },
            {
              group: ["@dayli/db", "@dayli/db/**"],
              message: "Services must use repository interfaces instead of database implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/api/src/features/**/contract.ts",
      "apps/api/src/features/**/*.contract.ts",
      "packages/contracts/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@dayli/db",
                "@dayli/db/**",
                "**/route",
                "**/route.*",
                "**/*.route",
                "**/*.route.*",
                "**/handler",
                "**/handler.*",
                "**/service",
                "**/service.*",
                "**/*.service",
                "**/*.service.*",
              ],
              message: "Contracts must not depend on routes, handlers, services, or database code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/api/src/features/**/route.ts",
      "apps/api/src/features/**/*.route.ts",
    ],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "Routes must call services or provider adapters instead of other HTTP routes.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/route", "**/route.*", "**/*.route", "**/*.route.*"],
              message: "Routes must not import other routes. Compose routes outside operation slices."
            },
          ],
        },
      ],
    },
  },
);
