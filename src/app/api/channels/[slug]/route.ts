import { NextResponse } from "next/server";

import { getChannelDetail } from "@/lib/dashboard-data";

type ChannelRouteProps = {
  params: Promise<{ slug: string }>;
};

export async function GET(_: Request, { params }: ChannelRouteProps) {
  const { slug } = await params;
  const detail = await getChannelDetail(slug);

  if (!detail) {
    return NextResponse.json({ error: "Channel not found." }, { status: 404 });
  }

  return NextResponse.json(detail);
}
