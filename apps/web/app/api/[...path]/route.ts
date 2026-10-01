import { forwardBrowserApiRequest } from "@/lib/api/server/browser-proxy";
import { browserApiTransport } from "@/lib/api/server/transport";

export const dynamic = "force-dynamic";

async function proxy(request: Request): Promise<Response> {
  return forwardBrowserApiRequest(request, await browserApiTransport());
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
