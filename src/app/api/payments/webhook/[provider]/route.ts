import { NextResponse } from "next/server";
import { handleGatewayEvent } from "@/server/payments/checkout";
import { isAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Gateway webhook endpoint (POST /api/payments/webhook/{provider}).
 * The adapter verifies the signature; events are idempotent by (provider, eventId).
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const rawBody = await req.text();
  const headers = Object.fromEntries([...req.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]));
  try {
    const result = await handleGatewayEvent(provider, rawBody, headers);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (isAppError(e)) {
      const status = e.code === "FORBIDDEN" ? 401 : e.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ ok: false, error: e.code }, { status });
    }
    logger.error("payment.webhook.error", { provider, error: e });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
