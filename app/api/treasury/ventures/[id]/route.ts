import { dispatchTreasuryRequest } from "../../../../../src/modules/treasury/routes.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string; pid?: string }> }) {
  return dispatchTreasuryRequest(req, "read", await ctx.params);
}
