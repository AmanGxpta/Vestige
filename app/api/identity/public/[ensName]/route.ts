// Thin Next.js App Router wrapper. Logic: src/modules/identity/http.ts (C1).
import { services } from "@/src/shared/composition";
import { handlers } from "../../../../../src/modules/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ ensName: string }> }) {
  return handlers((await services()).identity).publicSummary(req, (await ctx.params).ensName);
}
