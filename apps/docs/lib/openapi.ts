import { createOpenAPI } from 'fumadocs-openapi/server';
import type { Document } from 'fumadocs-openapi';
import document from '../../../packages/contracts/openapi.json';

export const openapi = createOpenAPI({
  input: {
    dayli: document as unknown as Document,
  },
});
