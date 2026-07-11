"use client";

import Image from "next/image";
import { useState } from "react";

type TokenAvatarProps = {
  src?: string | null;
  symbol: string;
  size?: number;
};

export function TokenAvatar({ src, symbol, size = 40 }: TokenAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const initials = symbol.slice(0, 3).toUpperCase();
  const hue = ((symbol.charCodeAt(0) ?? 65) * 137) % 360;

  if (src && src.length > 0 && !imgFailed) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt={symbol}
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
      className="shrink-0 rounded-full ring-1 ring-white/10 flex items-center justify-center font-bold select-none"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue},55%,30%), hsl(${(hue + 50) % 360},45%,20%))`,
        color: `hsl(${hue},80%,80%)`,
        fontSize: Math.round(size * 0.3),
        letterSpacing: "-0.02em",
      }}
    >
      {initials}
    </div>
  );
}