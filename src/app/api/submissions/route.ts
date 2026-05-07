import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabase";

const submissionSchema = z.object({
  telegramHandle: z.string().trim().min(2).max(120),
  telegramUrl: z.string().trim().url().optional().or(z.literal("")),
  channelName: z.string().trim().min(2).max(140),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  submitterContact: z.string().trim().max(200).optional().or(z.literal("")),
  fastTrackRequested: z.boolean().optional().default(false)
});

function normalizeHandle(value: string) {
  return value.replace(/^@/, "").trim().toLowerCase();
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = submissionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission payload." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("submissions")
    .insert({
      telegram_handle: normalizeHandle(parsed.data.telegramHandle),
      telegram_url: parsed.data.telegramUrl || null,
      channel_name: parsed.data.channelName,
      description: parsed.data.description || null,
      submitter_contact: parsed.data.submitterContact || null,
      fast_track_requested: parsed.data.fastTrackRequested,
      status: "pending"
    })
    .select("id, telegram_handle, channel_name, status, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: data.id,
      telegramHandle: data.telegram_handle,
      channelName: data.channel_name,
      status: data.status,
      createdAt: data.created_at
    },
    { status: 201 }
  );
}
