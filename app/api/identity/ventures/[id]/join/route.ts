// Thin Next.js App Router wrapper. Logic: src/modules/identity/http.ts (C1).
import { getIdentityServices } from "../../../../../../src/modules/identity/container";
import { handlers } from "../../../../../../src/modules/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handlers(getIdentityServices()).join(req, (await ctx.params).id);
}
