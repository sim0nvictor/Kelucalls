import { NextRequest, NextResponse } from "next/server";
import { requireAdminIdentity } from "@/lib/admin/auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";   // correct path

export const runtime = "nodejs";

const MAX_SIZE     = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  // Require admin session
  try {
    await requireAdminIdentity();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("bannerFile") as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large — max 5 MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, WebP, or GIF allowed." }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("ad-banners")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[upload-banner] Storage error:", uploadError.message);
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = supabase.storage
    .from("ad-banners")
    .getPublicUrl(path);

  return NextResponse.json({ publicUrl, storagePath: path });
}