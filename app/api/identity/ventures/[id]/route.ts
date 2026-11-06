// Thin Next.js App Router wrapper. Logic: src/modules/identity/http.ts (C1).
import { getIdentityServices } from "../../../../../src/modules/identity/container";
import { handlers } from "../../../../../src/modules/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handlers(getIdentityServices()).getVenture(req, (await ctx.params).id);
}
