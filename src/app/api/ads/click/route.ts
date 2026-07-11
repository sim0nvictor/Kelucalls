import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { createAdminDb } from "@/lib/admin/data";
import { checkRateLimit } from "@/lib/admin/rate-limit";

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const adId = searchParams.get("adId");
  const placementId = searchParams.get("placementId");

  if ((!adId && !placementId) || (adId && placementId)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const db = createAdminDb();
  const table = adId ? "ads" : "sponsored_placements";
  const id = adId ?? placementId ?? "";
  const idColumn = adId ? "ad_id" : "sponsored_placement_id";
  const { data, error } = await db.from(table).select("id, destination_url").eq("id", id).maybeSingle();

  if (error || !data?.destination_url) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "unknown";
  const rateLimit = checkRateLimit(`click:${id}:${forwardedFor}`, 10, 1000 * 60 * 10);

  if (rateLimit.allowed) {
    await db.from("ad_clicks").insert({
      [idColumn]: id,
      destination_url: data.destination_url,
      page_path: searchParams.get("from") ?? null,
      referrer: request.headers.get("referer"),
      user_agent: request.headers.get("user-agent"),
      ip_hash: hashValue(forwardedFor),
      session_id: request.headers.get("x-vercel-id") ?? null
    });
  }

  return NextResponse.redirect(data.destination_url);
}
