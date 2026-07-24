"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdminIdentity, clearAdminSessionCookies, logAdminAudit, signInAdminWithPassword } from "@/lib/admin/auth";
import { ADMIN_BASE_PATH, ADMIN_SIGN_IN_PATH } from "@/lib/admin/constants";
import { createAdminDb } from "@/lib/admin/data";
import { checkRateLimit } from "@/lib/admin/rate-limit";

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  nextUrl: z.string().trim().default(ADMIN_BASE_PATH)
});

const adSchema = z.object({
  channelId: z.string().uuid().optional().or(z.literal("")),   // now optional
  label: z.string().trim().min(2).max(120),
  placement: z.enum(["homepage", "channels", "live_feed", "tokens", "channel_detail"]),
  destinationUrl: z.string().trim().url(),
  creativeCopy: z.string().trim().max(280).optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),  // was imageAlt + imageFile
  status: z.enum(["draft", "active", "paused", "expired"]),
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().optional().or(z.literal("")),
  priority: z.coerce.number().int().min(0).max(10000),
});

const sponsoredPlacementSchema = z.object({
  title: z.string().trim().min(2).max(160),
  subtitle: z.string().trim().max(280).optional().or(z.literal("")),
  destinationUrl: z.string().trim().url(),
  surface: z.enum(["homepage", "trending", "tokens", "live_feed"]),
  placementType: z.enum(["featured_token", "project_spotlight", "homepage_slot", "trending_boost"]),
  slotKey: z.string().trim().min(2).max(80),
  tokenId: z.string().uuid().optional().or(z.literal("")),
  channelId: z.string().uuid().optional().or(z.literal("")),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  badgeLabel: z.string().trim().max(40).optional().or(z.literal("")),
  status: z.enum(["draft", "active", "paused", "expired"]),
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().optional().or(z.literal("")),
  priority: z.coerce.number().int().min(0).max(10000)
});

function normalizeTelegramHandle(value: string) {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function getAvailableSlug(base: string) {
  const db = createAdminDb();
  const normalizedBase = slugify(base) || "channel";
  let candidate = normalizedBase;
  let suffix = 2;

  while (true) {
    const { data, error } = await db.from("channels").select("id").eq("slug", candidate).maybeSingle();
    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }
}

function revalidateAdminPaths() {
  revalidatePath(ADMIN_BASE_PATH);
  revalidatePath(`${ADMIN_BASE_PATH}/ads`);
  revalidatePath(`${ADMIN_BASE_PATH}/placements`);
  revalidatePath(`${ADMIN_BASE_PATH}/moderation`);
  revalidatePath(`${ADMIN_BASE_PATH}/analytics`);
  revalidatePath(`${ADMIN_BASE_PATH}/insights`);
  revalidatePath("/insights");
  revalidatePath("/");
}

export async function signInAdminAction(formData: FormData) {
  const parsed = signInSchema.safeParse({
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
    nextUrl: String(formData.get("nextUrl") || ADMIN_BASE_PATH)
  });

  if (!parsed.success) {
    redirect(`${ADMIN_SIGN_IN_PATH}?error=invalid`);
  }

  const email = parsed.data.email.toLowerCase();
  const rateLimit = checkRateLimit(`admin-sign-in:${email}`, 6, 1000 * 60 * 10);

  if (!rateLimit.allowed) {
    redirect(`${ADMIN_SIGN_IN_PATH}?error=rate_limited`);
  }

  try {
    await signInAdminWithPassword(parsed.data.email, parsed.data.password);
  } catch {
    redirect(`${ADMIN_SIGN_IN_PATH}?error=invalid`);
  }

  redirect(parsed.data.nextUrl.startsWith(ADMIN_BASE_PATH) ? parsed.data.nextUrl : ADMIN_BASE_PATH);
}

export async function signOutAdminAction() {
  await clearAdminSessionCookies();
  redirect(ADMIN_SIGN_IN_PATH);
}

export async function createAdAction(formData: FormData) {
  // Identity check - ensures user is authenticated as admin
  const identity = await requireAdminIdentity();
  void identity;

  const parsed = adSchema.safeParse({
    channelId:      String(formData.get("channelId")      || ""),
    label:          String(formData.get("label")          || ""),
    placement:      String(formData.get("placement")      || "homepage"),
    destinationUrl: String(formData.get("destinationUrl") || ""),
    creativeCopy:   String(formData.get("creativeCopy")   || ""),
    imageUrl:       String(formData.get("imageUrl")       || ""),
    status:         String(formData.get("status")         || "draft"),
    startsAt:       String(formData.get("startsAt")       || ""),
    endsAt:         String(formData.get("endsAt")         || ""),
    priority:       String(formData.get("priority")       || "100"),
  });

  if (!parsed.success) {
    redirect(`${ADMIN_BASE_PATH}/ads?error=invalid`);
  }

  // imagePath comes from the AdBannerUploader hidden input
  const imagePath = String(formData.get("imagePath") || "") || null;

  const db = createAdminDb();
  const { data, error } = await db
    .from("ads")
    .insert({
      channel_id:      parsed.data.channelId || null,
      label:           parsed.data.label,
      placement:       parsed.data.placement,
      destination_url: parsed.data.destinationUrl,
      creative_copy:   parsed.data.creativeCopy || null,
      image_url:       parsed.data.imageUrl || null,
      image_path:      imagePath,
      image_alt:       null,
      starts_at:       new Date(parsed.data.startsAt).toISOString(),
      ends_at:         parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null,
      priority:        parsed.data.priority,
      status:          parsed.data.status,
      budget_usd:      null,
    })
    .select("id")
    .single();

  if (error) throw error;

  await logAdminAudit("create_ad", "ads", String(data.id), `Created ad "${parsed.data.label}"`, {
    placement: parsed.data.placement,
    destinationUrl: parsed.data.destinationUrl,
  });

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/ads?created=1`);
}

export async function toggleAdStatusAction(formData: FormData) {
  const identity = await requireAdminIdentity();
  const adId = String(formData.get("adId") || "");
  const nextStatus = String(formData.get("nextStatus") || "");

  if (!adId || !["active", "paused", "draft", "expired"].includes(nextStatus)) {
    redirect(`${ADMIN_BASE_PATH}/ads?error=invalid`);
  }

  const db = createAdminDb();
  const { error } = await db
    .from("ads")
    .update({
      status: nextStatus,
      updated_by: identity.id
    })
    .eq("id", adId);

  if (error) {
    throw error;
  }

  await logAdminAudit("toggle_ad_status", "ads", adId, `Set ad status to ${nextStatus}`, {
    nextStatus
  });

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/ads?saved=1`);
}


export async function createSponsoredPlacementAction(formData: FormData) {
  const identity = await requireAdminIdentity();
  const parsed = sponsoredPlacementSchema.safeParse({
    title: String(formData.get("title") || ""),
    subtitle: String(formData.get("subtitle") || ""),
    destinationUrl: String(formData.get("destinationUrl") || ""),
    surface: String(formData.get("surface") || ""),
    placementType: String(formData.get("placementType") || ""),
    slotKey: String(formData.get("slotKey") || ""),
    tokenId: String(formData.get("tokenId") || ""),
    channelId: String(formData.get("channelId") || ""),
    imageUrl: String(formData.get("imageUrl") || ""),
    badgeLabel: String(formData.get("badgeLabel") || ""),
    status: String(formData.get("status") || "draft"),
    startsAt: String(formData.get("startsAt") || ""),
    endsAt: String(formData.get("endsAt") || ""),
    priority: String(formData.get("priority") || "100")
  });

  if (!parsed.success || (!parsed.data.tokenId && !parsed.data.channelId)) {
    redirect(`${ADMIN_BASE_PATH}/placements?error=invalid`);
  }

  const db = createAdminDb();
  const { data, error } = await db
    .from("sponsored_placements")
    .insert({
      token_id: parsed.data.tokenId || null,
      channel_id: parsed.data.channelId || null,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle || null,
      destination_url: parsed.data.destinationUrl,
      surface: parsed.data.surface,
      placement_type: parsed.data.placementType,
      slot_key: parsed.data.slotKey,
      image_url: parsed.data.imageUrl || null,
      badge_label: parsed.data.badgeLabel || null,
      priority: parsed.data.priority,
      status: parsed.data.status,
      starts_at: new Date(parsed.data.startsAt).toISOString(),
      ends_at: parsed.data.endsAt ? new Date(parsed.data.endsAt).toISOString() : null,
      created_by: identity.id,
      updated_by: identity.id
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  await logAdminAudit(
    "create_sponsored_placement",
    "sponsored_placements",
    String(data.id),
    `Created sponsored placement "${parsed.data.title}"`,
    {
      surface: parsed.data.surface,
      placementType: parsed.data.placementType
    }
  );

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/placements?created=1`);
}

export async function toggleSponsoredPlacementStatusAction(formData: FormData) {
  await requireAdminIdentity();
  const placementId = String(formData.get("placementId") || "");
  const nextStatus = String(formData.get("nextStatus") || "");

  if (!placementId || !["draft", "active", "paused", "expired"].includes(nextStatus)) {
    redirect(`${ADMIN_BASE_PATH}/placements?error=invalid`);
  }

  const db = createAdminDb();
  const { error } = await db
    .from("sponsored_placements")
    .update({ status: nextStatus })
    .eq("id", placementId);

  if (error) {
    throw error;
  }

  await logAdminAudit(
    "toggle_sponsored_placement_status",
    "sponsored_placements",
    placementId,
    `Set sponsored placement status to ${nextStatus}`,
    { nextStatus }
  );

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/placements?saved=1`);
}

export async function approveSubmissionAction(formData: FormData) {
  await requireAdminIdentity();
  const submissionId = String(formData.get("submissionId") || "");

  if (!submissionId) {
    redirect(`${ADMIN_BASE_PATH}/moderation?error=invalid`);
  }

  const db = createAdminDb();
  const { data: submission, error: submissionError } = await db
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("status", "pending")
    .maybeSingle();

  if (submissionError) {
    throw submissionError;
  }

  if (!submission) {
    redirect(`${ADMIN_BASE_PATH}/moderation?error=not_found`);
  }

  const handle = normalizeTelegramHandle(String(submission.telegram_handle));
  const slug = await getAvailableSlug(handle || String(submission.channel_name));
  const telegramUrl = submission.telegram_url || `https://t.me/${handle}`;

  const { data: channel, error: channelError } = await db
    .from("channels")
    .insert({
      slug,
      telegram_handle: handle,
      telegram_url: telegramUrl,
      title: submission.channel_name,
      description: submission.description,
      status: "active",
      is_paid_channel: false,
      is_verified: false,
      notes: submission.review_notes ?? "Approved from the hidden admin submission queue."
    })
    .select("id")
    .single();

  if (channelError) {
    throw channelError;
  }

  const { error: updateError } = await db
    .from("submissions")
    .update({ status: "approved", approved_channel_id: channel.id })
    .eq("id", submissionId);

  if (updateError) {
    throw updateError;
  }

  await logAdminAudit("approve_submission", "submissions", submissionId, `Approved submission ${submission.channel_name}`, {
    approvedChannelId: channel.id
  });

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/moderation?approved=1`);
}

export async function rejectSubmissionAction(formData: FormData) {
  await requireAdminIdentity();
  const submissionId = String(formData.get("submissionId") || "");

  if (!submissionId) {
    redirect(`${ADMIN_BASE_PATH}/moderation?error=invalid`);
  }

  const db = createAdminDb();
  const { error } = await db.from("submissions").update({ status: "rejected" }).eq("id", submissionId);

  if (error) {
    throw error;
  }

  await logAdminAudit("reject_submission", "submissions", submissionId, "Rejected channel submission");

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/moderation?rejected=1`);
}

export async function updateChannelModerationAction(formData: FormData) {
  await requireAdminIdentity();
  const channelId = String(formData.get("channelId") || "");
  const nextStatus = String(formData.get("nextStatus") || "");

  if (!channelId || !["pending", "active", "paused", "archived"].includes(nextStatus)) {
    redirect(`${ADMIN_BASE_PATH}/moderation?error=invalid`);
  }

  const db = createAdminDb();
  const { error } = await db.from("channels").update({ status: nextStatus }).eq("id", channelId);

  if (error) {
    throw error;
  }

  await logAdminAudit("update_channel_status", "channels", channelId, `Set channel status to ${nextStatus}`, {
    nextStatus
  });

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/moderation?saved=1`);
}

export async function reviewModerationReportAction(formData: FormData) {
  const identity = await requireAdminIdentity();
  const reportId = String(formData.get("reportId") || "");
  const nextStatus = String(formData.get("nextStatus") || "");
  const resolutionNotes = String(formData.get("resolutionNotes") || "");

  if (!reportId || !["reviewing", "resolved", "dismissed"].includes(nextStatus)) {
    redirect(`${ADMIN_BASE_PATH}/moderation?error=invalid`);
  }

  const db = createAdminDb();
  const { error } = await db
    .from("moderation_reports")
    .update({
      status: nextStatus,
      resolution_notes: resolutionNotes || null,
      reviewed_by: identity.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", reportId);

  if (error) {
    throw error;
  }

  await logAdminAudit("review_moderation_report", "moderation_reports", reportId, `Marked report as ${nextStatus}`, {
    nextStatus
  });

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/moderation?saved=1`);
}
export async function updateChannelAction(formData: FormData) {
  await requireAdminIdentity();
  const channelId = String(formData.get("channelId") || "");
  const description = String(formData.get("description") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const status = String(formData.get("status") || "");

  if (!channelId) redirect(`${ADMIN_BASE_PATH}/channels?error=invalid`);

  const db = createAdminDb();
  const { error } = await db
    .from("channels")
    .update({
      ...(title && { title }),
      ...(description && { description }),
      ...( ["active","paused","archived","pending"].includes(status) && { status }),
    })
    .eq("id", channelId);

  if (error) throw error;

  revalidatePath(`${ADMIN_BASE_PATH}/channels`);
  revalidatePath("/channels");
  revalidatePath("/");
  redirect(`${ADMIN_BASE_PATH}/channels?saved=1`);
}

// ── Delete channel from DB ───────────────────────────────────────────────────
export async function deleteChannelAction(formData: FormData) {
  await requireAdminIdentity();
  const channelId = String(formData.get("channelId") || "");
  if (!channelId) redirect(`${ADMIN_BASE_PATH}/moderation?error=invalid`);

  const db = createAdminDb();

  // Fetch the channel handle before deleting (needed for tracking_requests cleanup)
  const { data: channel } = await db
    .from("channels")
    .select("telegram_handle, title")
    .eq("id", channelId)
    .single();

  // Cascade in FK dependency order:
  // 1. call_metrics references calls.id — must go first
  const { data: callRows } = await db
    .from("calls")
    .select("id")
    .eq("channel_id", channelId);

  if (callRows && callRows.length > 0) {
    const callIds = callRows.map((r) => r.id);
    await db.from("call_metrics").delete().in("call_id", callIds);
  }

  // 2. calls references channels.id
  await db.from("calls").delete().eq("channel_id", channelId);

  // 3. channel_stats references channels.id
  await db.from("channel_stats").delete().eq("channel_id", channelId);

  // 4. tracking_requests references telegram_handle (text match)
  if (channel?.telegram_handle) {
    await db
      .from("tracking_requests")
      .delete()
      .ilike("telegram_handle", channel.telegram_handle);
  }

  // 5. Finally delete the channel itself
  const { error } = await db.from("channels").delete().eq("id", channelId);
  if (error) throw error;

  await logAdminAudit(
    "delete_channel",
    "channels",
    channelId,
    `Permanently deleted channel "${channel?.title ?? channelId}" and all related data`
  );

  revalidatePath(`${ADMIN_BASE_PATH}/moderation`);
  revalidatePath(`${ADMIN_BASE_PATH}/channels`);
  revalidatePath("/channels");
  revalidatePath("/");
  redirect(`${ADMIN_BASE_PATH}/moderation?deleted=1`);
}

// ── Delete ad from DB (also removes Supabase Storage image if present) ───────
export async function deleteAdAction(formData: FormData) {
  await requireAdminIdentity();
  const adId = String(formData.get("adId") || "");
  if (!adId) redirect(`${ADMIN_BASE_PATH}/ads?error=invalid`);

  const db = createAdminDb();

  // Fetch the image_path before deleting so we can clean up Storage
  const { data: ad } = await db.from("ads").select("image_path, label").eq("id", adId).single();

  // Delete from Storage if there's an uploaded image
  if (ad?.image_path) {
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    const storageClient = createSupabaseAdmin();
    await storageClient.storage.from("ad-banners").remove([ad.image_path]);
  }

  const { error } = await db.from("ads").delete().eq("id", adId);
  if (error) throw error;

  await logAdminAudit("delete_ad", "ads", adId, `Deleted ad "${ad?.label ?? adId}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/ads?deleted=1`);
}

// ── Delete sponsored placement from DB ───────────────────────────────────────
export async function deleteSponsoredPlacementAction(formData: FormData) {
  await requireAdminIdentity();
  const placementId = String(formData.get("placementId") || "");
  if (!placementId) redirect(`${ADMIN_BASE_PATH}/placements?error=invalid`);

  const db = createAdminDb();
  const { data: p } = await db.from("sponsored_placements").select("title").eq("id", placementId).single();

  const { error } = await db.from("sponsored_placements").delete().eq("id", placementId);
  if (error) throw error;

  await logAdminAudit("delete_sponsored_placement", "sponsored_placements", placementId, `Deleted placement "${p?.title ?? placementId}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/placements?deleted=1`);
}

// ── Upload ad banner image to Supabase Storage ────────────────────────────────
// Called from the ads page — returns the public URL to be stored in ads.image_url
export async function uploadAdBannerAction(formData: FormData) {
  await requireAdminIdentity();

  const file = formData.get("bannerFile") as File | null;
  if (!file || file.size === 0) {
    return { error: "No file provided." };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: "File too large. Maximum 5MB." };
  }

  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or GIF allowed." };
  }

  const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
  const storageClient = createSupabaseAdmin();

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error } = await storageClient.storage
    .from("ad-banners")
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (error) return { error: `Upload failed: ${error.message}` };

  const { data: { publicUrl } } = storageClient.storage.from("ad-banners").getPublicUrl(path);

  return { publicUrl, storagePath: path };
}

// ── Create sponsored placement (channel or token) ─────────────────────────────
// Replaces the old createSponsoredPlacementAction with subtype support
export async function createSponsoredPlacementV2Action(formData: FormData) {
  const identity = await requireAdminIdentity();

  const placementSubtype = String(formData.get("placementSubtype") || "channel_placement");
  const isChannelPlacement = placementSubtype === "channel_placement";

  const title          = String(formData.get("title") || "").trim();
  const creativeCopy   = String(formData.get("creativeCopy") || "").trim();
  const destinationUrl = String(formData.get("destinationUrl") || "").trim();
  const startsAt       = String(formData.get("startsAt") || "");
  const endsAt         = String(formData.get("endsAt") || "");
  const channelId      = String(formData.get("channelId") || "") || null;
  const tokenId        = String(formData.get("tokenId") || "") || null;
  const logoUrl        = String(formData.get("logoUrl") || "") || null;
  const tokenSymbol    = String(formData.get("tokenSymbol") || "") || null;
  const contractAddress = String(formData.get("contractAddress") || "") || null;

  if (!title || !destinationUrl || !startsAt) {
    redirect(`${ADMIN_BASE_PATH}/placements?error=invalid`);
  }

  if (isChannelPlacement && !channelId) {
    redirect(`${ADMIN_BASE_PATH}/placements?error=channel_required`);
  }

  if (!isChannelPlacement && !tokenSymbol) {
    redirect(`${ADMIN_BASE_PATH}/placements?error=token_required`);
  }

  const db = createAdminDb();

  // If it's a channel placement, pull the channel's avatar_url as the logo
  let resolvedLogoUrl = logoUrl;
  if (isChannelPlacement && channelId && !resolvedLogoUrl) {
    const { data: ch } = await db.from("channels").select("avatar_url").eq("id", channelId).single();
    resolvedLogoUrl = ch?.avatar_url ?? null;
  }

  const { data, error } = await db
    .from("sponsored_placements")
    .insert({
      title,
      subtitle:          creativeCopy || null,
      destination_url:   destinationUrl,
      surface:           isChannelPlacement ? "homepage" : String(formData.get("surface") || "trending"),
      placement_type:    isChannelPlacement ? "homepage_slot" : "featured_token",
      placement_subtype: placementSubtype,
      slot_key:          isChannelPlacement ? "leaderboard-inline" : "token-spotlight",
      channel_id:        channelId,
      token_id:          tokenId,
      logo_url:          resolvedLogoUrl,
      token_symbol:      tokenSymbol,
      contract_address:  contractAddress,
      priority:          Number(formData.get("priority") || "100"),
      status:            "draft",
      starts_at:         new Date(startsAt).toISOString(),
      ends_at:           endsAt ? new Date(endsAt).toISOString() : null,
      created_by:        identity.id,
      updated_by:        identity.id,
    })
    .select("id")
    .single();

  if (error) throw error;

  await logAdminAudit(
    "create_sponsored_placement",
    "sponsored_placements",
    String(data.id),
    `Created ${placementSubtype} placement "${title}"`,
    { placementSubtype }
  );

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/placements?created=1`);
}

// ============================================================================
// Insights / Articles System
// ============================================================================

const articleSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with dashes"),
  summary: z.string().trim().max(1000).optional().or(z.literal("")),
  content: z.string().trim().min(10),
  featuredImageUrl: z.string().trim().url().optional().or(z.literal("")),
  featuredImageAlt: z.string().trim().max(200).optional().or(z.literal("")),
  author: z.string().trim().max(100).default("Kelucalls Team"),
  authorAvatarUrl: z.string().trim().url().optional().or(z.literal("")),
  categoryId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["draft", "published", "scheduled", "archived"]).default("draft"),
  publishedAt: z.string().trim().optional().or(z.literal("")),
  scheduledAt: z.string().trim().optional().or(z.literal("")),
  isFeatured: z.coerce.boolean().default(false),
  isTrending: z.coerce.boolean().default(false),
  isEditorPick: z.coerce.boolean().default(false),
  readingTimeMinutes: z.coerce.number().int().min(1).max(120).default(5),
  seoTitle: z.string().trim().max(70).optional().or(z.literal("")),
  metaDescription: z.string().trim().max(160).optional().or(z.literal("")),
  canonicalUrl: z.string().trim().url().optional().or(z.literal("")),
  keywords: z.string().trim().optional().or(z.literal("")),
  openGraphImageUrl: z.string().trim().url().optional().or(z.literal("")),
  twitterCard: z.enum(["summary", "summary_large_image"]).default("summary_large_image"),
  linkedTokenId: z.string().uuid().optional().or(z.literal("")),
  linkedChannelId: z.string().uuid().optional().or(z.literal("")),
  tagIds: z.array(z.string().uuid()).default([])
});

function slugifyArticle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAvailableArticleSlug(base: string) {
  const db = createAdminDb();
  const normalizedBase = slugifyArticle(base) || "article";
  let candidate = normalizedBase;
  let suffix = 2;

  while (true) {
    const { data, error } = await db.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
    candidate = `${normalizedBase}-${suffix}`;
    suffix += 1;
  }
}

export async function createArticleAction(formData: FormData) {
  await requireAdminIdentity();

  const tagIdsStr = String(formData.get("tagIds") || "[]");
  let tagIds: string[] = [];
  try {
    tagIds = JSON.parse(tagIdsStr);
  } catch {
    tagIds = [];
  }

  const parsed = articleSchema.safeParse({
    title: String(formData.get("title") || ""),
    slug: String(formData.get("slug") || ""),
    summary: String(formData.get("summary") || ""),
    content: String(formData.get("content") || ""),
    featuredImageUrl: String(formData.get("featuredImageUrl") || ""),
    featuredImageAlt: String(formData.get("featuredImageAlt") || ""),
    author: String(formData.get("author") || "Kelucalls Team"),
    authorAvatarUrl: String(formData.get("authorAvatarUrl") || ""),
    categoryId: String(formData.get("categoryId") || ""),
    status: String(formData.get("status") || "draft"),
    publishedAt: String(formData.get("publishedAt") || ""),
    scheduledAt: String(formData.get("scheduledAt") || ""),
    isFeatured: String(formData.get("isFeatured") || "false"),
    isTrending: String(formData.get("isTrending") || "false"),
    isEditorPick: String(formData.get("isEditorPick") || "false"),
    readingTimeMinutes: String(formData.get("readingTimeMinutes") || "5"),
    seoTitle: String(formData.get("seoTitle") || ""),
    metaDescription: String(formData.get("metaDescription") || ""),
    canonicalUrl: String(formData.get("canonicalUrl") || ""),
    keywords: String(formData.get("keywords") || ""),
    openGraphImageUrl: String(formData.get("openGraphImageUrl") || ""),
    twitterCard: String(formData.get("twitterCard") || "summary_large_image"),
    linkedTokenId: String(formData.get("linkedTokenId") || ""),
    linkedChannelId: String(formData.get("linkedChannelId") || ""),
    tagIds
  });

  if (!parsed.success) {
    console.error("Article validation error:", parsed.error.flatten());
    redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);
  }

  const db = createAdminDb();
  const { data, error } = await db
    .from("articles")
    .insert({
      title: parsed.data.title,
      slug: parsed.data.slug,
      summary: parsed.data.summary || null,
      content: parsed.data.content,
      featured_image_url: parsed.data.featuredImageUrl || null,
      featured_image_alt: parsed.data.featuredImageAlt || null,
      author: parsed.data.author,
      author_avatar_url: parsed.data.authorAvatarUrl || null,
      category_id: parsed.data.categoryId || null,
      status: parsed.data.status,
      published_at: parsed.data.publishedAt ? new Date(parsed.data.publishedAt).toISOString() : null,
      scheduled_at: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt).toISOString() : null,
      is_featured: parsed.data.isFeatured,
      is_trending: parsed.data.isTrending,
      is_editor_pick: parsed.data.isEditorPick,
      reading_time_minutes: parsed.data.readingTimeMinutes,
      seo_title: parsed.data.seoTitle || null,
      meta_description: parsed.data.metaDescription || null,
      canonical_url: parsed.data.canonicalUrl || null,
      keywords: parsed.data.keywords ? parsed.data.keywords.split(",").map((k) => k.trim()).filter(Boolean) : null,
      open_graph_image_url: parsed.data.openGraphImageUrl || null,
      twitter_card: parsed.data.twitterCard,
      linked_token_id: parsed.data.linkedTokenId || null,
      linked_channel_id: parsed.data.linkedChannelId || null
    })
    .select("id")
    .single();

  if (error) {
    console.error("Article create error:", error);
    throw error;
  }

  // Add tags
  if (tagIds.length > 0 && data) {
    const tagJunctions = tagIds.map((tagId) => ({
      article_id: data.id,
      tag_id: tagId
    }));
    await db.from("article_tags_junction").insert(tagJunctions);
  }

  await logAdminAudit("create_article", "articles", String(data.id), `Created article "${parsed.data.title}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/insights?created=1`);
}

export async function updateArticleAction(formData: FormData) {
  await requireAdminIdentity();

  const articleId = String(formData.get("articleId") || "");
  if (!articleId) redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);

  const tagIdsStr = String(formData.get("tagIds") || "[]");
  let tagIds: string[] = [];
  try {
    tagIds = JSON.parse(tagIdsStr);
  } catch {
    tagIds = [];
  }

  const parsed = articleSchema.partial().safeParse({
    title: String(formData.get("title") || ""),
    slug: String(formData.get("slug") || ""),
    summary: String(formData.get("summary") || ""),
    content: String(formData.get("content") || ""),
    featuredImageUrl: String(formData.get("featuredImageUrl") || ""),
    featuredImageAlt: String(formData.get("featuredImageAlt") || ""),
    author: String(formData.get("author") || ""),
    authorAvatarUrl: String(formData.get("authorAvatarUrl") || ""),
    categoryId: String(formData.get("categoryId") || ""),
    status: String(formData.get("status") || ""),
    publishedAt: String(formData.get("publishedAt") || ""),
    scheduledAt: String(formData.get("scheduledAt") || ""),
    isFeatured: String(formData.get("isFeatured") || ""),
    isTrending: String(formData.get("isTrending") || ""),
    isEditorPick: String(formData.get("isEditorPick") || ""),
    readingTimeMinutes: String(formData.get("readingTimeMinutes") || ""),
    seoTitle: String(formData.get("seoTitle") || ""),
    metaDescription: String(formData.get("metaDescription") || ""),
    canonicalUrl: String(formData.get("canonicalUrl") || ""),
    keywords: String(formData.get("keywords") || ""),
    openGraphImageUrl: String(formData.get("openGraphImageUrl") || ""),
    twitterCard: String(formData.get("twitterCard") || ""),
    linkedTokenId: String(formData.get("linkedTokenId") || ""),
    linkedChannelId: String(formData.get("linkedChannelId") || ""),
    tagIds
  });

  if (!parsed.success) {
    console.error("Article update validation error:", parsed.error.flatten());
    redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);
  }

  const db = createAdminDb();
  const updateData: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.slug !== undefined) updateData.slug = parsed.data.slug;
  if (parsed.data.summary !== undefined) updateData.summary = parsed.data.summary;
  if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
  if (parsed.data.featuredImageUrl !== undefined) updateData.featured_image_url = parsed.data.featuredImageUrl || null;
  if (parsed.data.featuredImageAlt !== undefined) updateData.featured_image_alt = parsed.data.featuredImageAlt || null;
  if (parsed.data.author !== undefined) updateData.author = parsed.data.author;
  if (parsed.data.authorAvatarUrl !== undefined) updateData.author_avatar_url = parsed.data.authorAvatarUrl || null;
  if (parsed.data.categoryId !== undefined) updateData.category_id = parsed.data.categoryId || null;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.publishedAt !== undefined) updateData.published_at = parsed.data.publishedAt ? new Date(parsed.data.publishedAt).toISOString() : null;
  if (parsed.data.scheduledAt !== undefined) updateData.scheduled_at = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt).toISOString() : null;
  if (parsed.data.isFeatured !== undefined) updateData.is_featured = parsed.data.isFeatured;
  if (parsed.data.isTrending !== undefined) updateData.is_trending = parsed.data.isTrending;
  if (parsed.data.isEditorPick !== undefined) updateData.is_editor_pick = parsed.data.isEditorPick;
  if (parsed.data.readingTimeMinutes !== undefined) updateData.reading_time_minutes = parsed.data.readingTimeMinutes;
  if (parsed.data.seoTitle !== undefined) updateData.seo_title = parsed.data.seoTitle || null;
  if (parsed.data.metaDescription !== undefined) updateData.meta_description = parsed.data.metaDescription || null;
  if (parsed.data.canonicalUrl !== undefined) updateData.canonical_url = parsed.data.canonicalUrl || null;
  if (parsed.data.keywords !== undefined) updateData.keywords = parsed.data.keywords ? parsed.data.keywords.split(",").map((k) => k.trim()).filter(Boolean) : null;
  if (parsed.data.openGraphImageUrl !== undefined) updateData.open_graph_image_url = parsed.data.openGraphImageUrl || null;
  if (parsed.data.twitterCard !== undefined) updateData.twitter_card = parsed.data.twitterCard;
  if (parsed.data.linkedTokenId !== undefined) updateData.linked_token_id = parsed.data.linkedTokenId || null;
  if (parsed.data.linkedChannelId !== undefined) updateData.linked_channel_id = parsed.data.linkedChannelId || null;

  const { error } = await db.from("articles").update(updateData).eq("id", articleId);

  if (error) {
    console.error("Article update error:", error);
    throw error;
  }

  // Update tags if provided
  if (tagIds.length > 0 || formData.get("tagIds")) {
    await db.from("article_tags_junction").delete().eq("article_id", articleId);
    if (tagIds.length > 0) {
      const tagJunctions = tagIds.map((tagId) => ({
        article_id: articleId,
        tag_id: tagId
      }));
      await db.from("article_tags_junction").insert(tagJunctions);
    }
  }

  await logAdminAudit("update_article", "articles", articleId, `Updated article`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/insights?edit=${articleId}&saved=1`);
}

export async function deleteArticleAction(formData: FormData) {
  await requireAdminIdentity();
  const articleId = String(formData.get("articleId") || "");
  if (!articleId) redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);

  const db = createAdminDb();
  const { data: article } = await db.from("articles").select("title").eq("id", articleId).single();

  const { error } = await db.from("articles").delete().eq("id", articleId);
  if (error) throw error;

  await logAdminAudit("delete_article", "articles", articleId, `Deleted article "${article?.title ?? articleId}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/insights?deleted=1`);
}

export async function createArticleCategoryAction(formData: FormData) {
  await requireAdminIdentity();

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const description = String(formData.get("description") || "").trim();
  const color = String(formData.get("color") || "#22d3ee").trim();
  const sortOrder = Number(formData.get("sortOrder") || "0");

  if (!name || !slug) redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);

  const db = createAdminDb();
  const { error } = await db.from("article_categories").insert({
    name,
    slug,
    description: description || null,
    color,
    sort_order: sortOrder
  });

  if (error) throw error;

  await logAdminAudit("create_article_category", "article_categories", slug, `Created category "${name}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/insights?created=1`);
}

export async function createArticleTagAction(formData: FormData) {
  await requireAdminIdentity();

  const name = String(formData.get("name") || "").trim();
  const slug = String(formData.get("slug") || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

  if (!name || !slug) redirect(`${ADMIN_BASE_PATH}/insights?error=invalid`);

  const db = createAdminDb();
  const { error } = await db.from("article_tags").insert({ name, slug });

  if (error) throw error;

  await logAdminAudit("create_article_tag", "article_tags", slug, `Created tag "${name}"`);

  revalidateAdminPaths();
  redirect(`${ADMIN_BASE_PATH}/insights?created=1`);
}

export async function generateArticleSlugAction(title: string) {
  return getAvailableArticleSlug(title);
}