import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-sm uppercase tracking-[0.32em] text-cyan-300">404</p>
      <h1 className="text-4xl font-semibold text-white">Channel not found.</h1>
      <p className="max-w-xl text-slate-400">
        The requested crypto community is not in the current directory. Explore the full channel list instead.
      </p>
      <Link href="/channels">
        <Button>Go to Channels</Button>
      </Link>
    </div>
  );
}
