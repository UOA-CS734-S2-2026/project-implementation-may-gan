// The runtime binding is narrowed in transport.cloudflare.ts to avoid merging Worker and DOM globals.
declare module "cloudflare:workers" {
  export const env: unknown;
}
