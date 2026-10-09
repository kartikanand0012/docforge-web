import { NextResponse } from "next/server";
import { demoAccount } from "@/lib/demo";

/** The demo account to offer on the sign-in page, or 404 where there is no public demo. */
export function GET() {
  const account = demoAccount();
  return account ? NextResponse.json(account, { headers: { "Cache-Control": "no-store" } }) : new NextResponse(null, { status: 404 });
}
