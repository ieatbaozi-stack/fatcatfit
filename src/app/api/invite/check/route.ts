import { checkInvite } from "@/lib/auth/invite-check";
import { getDataDb } from "@/lib/data/server/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return checkInvite(getDataDb(), request, new Date());
}
