"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setChannelFollowAction } from "@/lib/account/actions";
import { LOGIN_PATH, NEXT_PARAM } from "@/lib/auth/constants";

/**
 * Follow / unfollow a channel.
 *
 * Drop this on any channel card or channel page:
 *
 *   <FollowChannelButton
 *     channelId={channel.id}
 *     initialFollowing={followedIds.has(channel.id)}
 *     isSignedIn={Boolean(user)}
 *   />
 *
 * Signed-out users are sent to /login with a ?next= back to where they were,
 * so following is a one-click action after signing in rather than a dead end.
 */
export function FollowChannelButton({
  channelId,
  initialFollowing,
  isSignedIn,
  size = "default"
}: {
  channelId: string;
  initialFollowing: boolean;
  isSignedIn: boolean;
  size?: "default" | "sm";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic local state so the button responds instantly.
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);

  const sizeClasses =
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";

  function handleClick() {
    if (!isSignedIn) {
      const from = `${window.location.pathname}${window.location.search}`;
      router.push(`${LOGIN_PATH}?${NEXT_PARAM}=${encodeURIComponent(from)}`);
      return;
    }

    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setError(null);

    startTransition(async () => {
      const result = await setChannelFollowAction(channelId, nextFollowing);
      if (!result.ok) {
        setFollowing(!nextFollowing); // roll back
        if (result.code === "unauthenticated") {
          router.push(LOGIN_PATH);
          return;
        }
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={following}
        className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition disabled:opacity-60 ${sizeClasses} ${
          following
            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
            : "border-white/15 bg-white/5 text-slate-200 hover:border-cyan-500/50 hover:text-cyan-300"
        }`}
      >
        {following ? "Following" : "Follow"}
      </button>
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </span>
  );
}
