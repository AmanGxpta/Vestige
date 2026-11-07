// Thin Next.js App Router wrapper. Logic: src/modules/identity/http.ts (C1).
import { services } from "@/src/shared/composition";
import { handlers } from "../../../../../src/modules/identity/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handlers((await services()).identity).authSession(req);
}

export async function DELETE(req: Request) {
  return handlers((await services()).identity).authLogout(req);
}
