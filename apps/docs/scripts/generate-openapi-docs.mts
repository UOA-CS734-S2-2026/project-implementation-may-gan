import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../lib/openapi';

async function main() {
  await generateFiles({
    input: openapi,
    output: 'content/docs/api-reference',
    per: 'operation',
    groupBy: 'tag',
    includeDescription: true,
    index: {
      url: {
        baseUrl: '/docs',
        contentDir: 'content/docs',
      },
      items: [
        {
          path: 'index.mdx',
          title: 'API reference',
          description: 'Reference generated from the Dayli OpenAPI document.',
        },
      ],
    },
    meta: true,
    beforeWrite(files) {
      const index = files.find((file) => file.path === 'index.mdx');
      if (index) {
        index.content = index.content.replace(
          '\n\n<Cards>',
          "\n\nDayli's web and mobile apps both use this API. These pages are generated from the OpenAPI document used to create the client libraries, so changes to a route, request, or response start in the API contract.\n\n<Cards>",
        );
        index.content += '\n\n[Open the interactive API explorer](/docs/api-reference/playground)\n';
      }

      const meta = files.find((file) => file.path === 'meta.json');
      if (meta) {
        meta.content = `${JSON.stringify(
          {
            title: 'API reference',
            defaultOpen: true,
            ...JSON.parse(meta.content),
          },
          null,
          2,
        )}\n`;
      }
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
