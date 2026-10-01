import { forwardBrowserApiRequest } from "@/lib/api/server/browser-proxy";
import { browserApiTransport } from "@/lib/api/server/transport";
import { browserProxyEnabled } from "@/lib/api/config";

export const dynamic = "force-dynamic";

async function proxy(request: Request): Promise<Response> {
  // The public route stays inert until the explicit browser proxy build opt-in.
  if (!browserProxyEnabled) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return forwardBrowserApiRequest(request, await browserApiTransport());
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
