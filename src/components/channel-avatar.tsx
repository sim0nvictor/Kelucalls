"use client";

import Image from "next/image";
import { useState } from "react";

type ChannelAvatarProps = {
  src: string | null | undefined;
  title: string;
  size?: number;
};

export function ChannelAvatar({ src, title, size = 48 }: ChannelAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

  const hue = ((title.charCodeAt(0) ?? 65) * 137) % 360;

  if (src && !imgFailed) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-full ring-2 ring-white/10"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={title}
          fill
          sizes={`${size}px`}
          className="object-cover"
          loading="eager" 
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className="shrink-0 rounded-full ring-2 ring-white/10 flex items-center justify-center font-bold select-none"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue},60%,35%), hsl(${(hue + 40) % 360},50%,25%))`,
        color: `hsl(${hue},80%,85%)`,
        fontSize: Math.round(size * 0.35),
      }}
    >
      {initials}
    </div>
  );
}