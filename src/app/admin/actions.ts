"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearAdminSessionCookie,
  createAdminSessionCookie,
  requireAdminSession,
  validateAdminCredentials
} from "@/lib/admin-auth";
import { getSupabaseServerClient } from "@/lib/supabase";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().trim().min(1),
  nextUrl: z.string().trim().default("/admin")
});

const updateChannelSchema = z.object({
  channelId: z.string().uuid(),
  slug: z.string().trim().min(2).max(80),
  title: z.string().trim().min(2).max(140),
  telegramHandle: z.string().trim().min(2).max(120),
  telegramUrl: z.string().trim().url(),
  description: z.string().trim().max(3000).optional().nullable(),
  status: z.enum(["pending", "active", "paused", "archived"]),
  isPaidChannel: z.boolean(),
  isVerified: z.boolean(),
  notes: z.string().trim().max(3000).optional().nullable()
});

function getBooleanField(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeTelegramHandle(value: string) {
  return value.replace(/^@/, "").trim().toLowerCase();
}

async function getAvailableSlug(base: string) {
  const supabase = getSupabaseServerClient();
  const normalizedBase = slugify(base) || "channel";
  let candidate = normalizedBase;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("channels")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

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

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/channels");
  revalidatePath("/admin");
}

export async function loginAdmin(formData: FormData) {
  const parsed = loginSchema.safeParse({
    username: String(formData.get("username") || ""),
    password: String(formData.get("password") || ""),
    nextUrl: String(formData.get("nextUrl") || "/admin")
  });

  if (!parsed.success) {
    redirect("/login?error=invalid");
  }

  if (!validateAdminCredentials(parsed.data.username, parsed.data.password)) {
    redirect(`/login?error=invalid&next=${encodeURIComponent(parsed.data.nextUrl)}`);
  }

  await createAdminSessionCookie();
  redirect(parsed.data.nextUrl.startsWith("/") ? parsed.data.nextUrl : "/admin");
}

export async function logoutAdmin() {
  await clearAdminSessionCookie();
  redirect("/login");
}

export async function approveSubmission(formData: FormData) {
  await requireAdminSession();

  const submissionId = String(formData.get("submissionId") || "");
  if (!submissionId) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("status", "pending")
    .maybeSingle();

  if (submissionError) {
    throw submissionError;
  }

  if (!submission) {
    return;
  }

  const handle = normalizeTelegramHandle(submission.telegram_handle);
  const slug = await getAvailableSlug(handle || submission.channel_name);
  const telegramUrl = submission.telegram_url || `https://t.me/${handle}`;

  const { data: channel, error: channelError } = await supabase
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
      notes: submission.review_notes ?? "Approved from public submission queue."
    })
    .select("id")
    .single();

  if (channelError) {
    throw channelError;
  }

  const { error: updateError } = await supabase
    .from("submissions")
    .update({
      status: "approved",
      approved_channel_id: channel.id
    })
    .eq("id", submissionId);

  if (updateError) {
    throw updateError;
  }

  revalidateAll();
  revalidatePath(`/channel/${slug}`);
}

export async function rejectSubmission(formData: FormData) {
  await requireAdminSession();

  const submissionId = String(formData.get("submissionId") || "");
  if (!submissionId) {
    return;
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("submissions")
    .update({ status: "rejected" })
    .eq("id", submissionId);

  if (error) {
    throw error;
  }

  revalidateAll();
}

export async function updateChannel(formData: FormData) {
  await requireAdminSession();

  const raw = {
    channelId: String(formData.get("channelId") || ""),
    slug: slugify(String(formData.get("slug") || "")),
    title: String(formData.get("title") || ""),
    telegramHandle: normalizeTelegramHandle(String(formData.get("telegramHandle") || "")),
    telegramUrl: String(formData.get("telegramUrl") || ""),
    description: String(formData.get("description") || "") || null,
    status: String(formData.get("status") || ""),
    isPaidChannel: getBooleanField(formData, "isPaidChannel"),
    isVerified: getBooleanField(formData, "isVerified"),
    notes: String(formData.get("notes") || "") || null
  };

  const parsed = updateChannelSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/admin/channels/${raw.channelId}?error=invalid`);
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("channels")
    .update({
      slug: parsed.data.slug,
      title: parsed.data.title,
      telegram_handle: parsed.data.telegramHandle,
      telegram_url: parsed.data.telegramUrl,
      description: parsed.data.description,
      status: parsed.data.status,
      is_paid_channel: parsed.data.isPaidChannel,
      is_verified: parsed.data.isVerified,
      notes: parsed.data.notes
    })
    .eq("id", parsed.data.channelId);

  if (error) {
    throw error;
  }

  revalidateAll();
  revalidatePath(`/channel/${parsed.data.slug}`);
  revalidatePath(`/admin/channels/${parsed.data.channelId}`);
  redirect(`/admin/channels/${parsed.data.channelId}?saved=1`);
}
