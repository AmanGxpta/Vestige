import { services } from "@/src/shared/composition";
import { dispatchTreasuryRequest } from "../../../../../../../../src/modules/treasury/routes.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request, ctx: { params: Promise<{ id: string; pid?: string }> }) {
  return dispatchTreasuryRequest(req, "execute", await ctx.params, services);
}
