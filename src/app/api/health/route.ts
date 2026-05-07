import { NextResponse } from "next/server";

import { runHealthChecks } from "@/lib/supabase/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runHealthChecks();

  const status = report.overall === "ok" ? 200 : report.overall === "warning" ? 200 : 503;

  return NextResponse.json(report, { status });
}
