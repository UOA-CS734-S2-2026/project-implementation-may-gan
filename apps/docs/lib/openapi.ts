import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  input: {
    dayli: '../../packages/contracts/openapi.json',
  },
});
