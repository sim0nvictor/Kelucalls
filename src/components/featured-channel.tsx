import Link from "next/link";
import { ArrowRight, Send, ShieldCheck, Sparkles, Users } from "lucide-react";

import { VoteButton } from "@/components/vote-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Channel } from "@/types/channel";

type FeaturedChannelProps = {
  channel: Channel;
};

export function FeaturedChannel({ channel }: FeaturedChannelProps) {
  return (
    <Card className="overflow-hidden border-cyan-400/20 bg-linear-to-br from-cyan-400/8 via-slate-950 to-slate-950 shadow-[0_0_80px_rgba(34,211,238,0.08)]">
      <CardContent className="grid gap-10 p-6 lg:grid-cols-[1.3fr_0.7fr] lg:p-8">
        <div className="space-y-6">
          <Badge className="bg-cyan-400/12 text-cyan-100">Featured Alpha Room</Badge>
          <div className="space-y-4">
            <div className={`inline-flex rounded-full bg-linear-to-r px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-950 ${channel.accent}`}>
              {channel.name}
            </div>
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Telegram-first crypto conviction built to convert attention into action.
            </h2>
            <p className="max-w-2xl text-base leading-8 text-slate-300">{channel.description}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-slate-200">
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{channel.members}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{channel.status}</div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2">{channel.category}</div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={channel.telegramUrl} target="_blank" rel="noreferrer">
              <Button size="lg">
                Join Kelus Call
                <Send className="size-4" />
              </Button>
            </a>
            <Link href={`/channel/${channel.id}`}>
              <Button variant="secondary" size="lg">
                View Full Profile
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-slate-400">Community actions</span>
              <VoteButton />
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-4">
                <Users className="size-5 text-cyan-300" />
                <div>
                  <p className="text-sm text-slate-400">Subscribers</p>
                  <p className="font-semibold text-white">{channel.members}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-4">
                <ShieldCheck className="size-5 text-emerald-300" />
                <div>
                  <p className="text-sm text-slate-400">Verification</p>
                  <p className="font-semibold text-white">{channel.status}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/4 p-4">
                <Sparkles className="size-5 text-sky-300" />
                <div>
                  <p className="text-sm text-slate-400">Source</p>
                  <p className="font-semibold text-white">{channel.source}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
