import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: { adId?: string; sponsoredPlacementId?: string; pagePath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { adId, sponsoredPlacementId, pagePath } = body;

  if (!adId && !sponsoredPlacementId) {
    return NextResponse.json({ error: "adId or sponsoredPlacementId required." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  const { error } = await supabase.from("ad_impressions").insert({
    ad_id: adId ?? null,
    sponsored_placement_id: sponsoredPlacementId ?? null,
    page_path: pagePath ?? null,
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    // Impressions are best-effort — don't break the UI if this fails
    console.warn("[ads/impression] insert failed:", error.message);
  }

  return NextResponse.json({ ok: true });
}