"use client";

import { useState } from "react";
import { coverSrc, type IgdbSize } from "@/lib/cover";

/**
 * 커버 2단 폴백 + 실패 시 플레이스홀더.
 *
 * next/image를 안 쓴다 — IGDB 도메인을 remotePatterns에 등록해야 하고
 * 최적화 서버를 거치면 오히려 느려진다. 이미 CDN에서 크기별로 오는 이미지다.
 *
 * 호버는 **틀이 아니라 안의 이미지만** 움직인다. 틀이 커지면 그리드가 술렁이고
 * `overflow-hidden` 때문에 위쪽이 잘려 사라진 것처럼 보인다.
 * 이미지를 확대하고 위에서 아래로 옅은 광택이 지나가게 해 반응을 알린다
 */
export default function GameCover({
  coverUrl,
  coverImageId,
  name,
  size = "t_cover_big",
  className = "",
}: {
  coverUrl: string | null;
  coverImageId: string | null;
  name: string;
  size?: IgdbSize;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = broken ? null : coverSrc(coverUrl, coverImageId, size);

  return (
    <div
      className={`image-placeholder relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-white/5 ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs font-bold tracking-wider text-white/15">
          {name.slice(0, 18)}
        </div>
      )}

      {/* 광택 — 45도로 눕힌 띠가 왼쪽 밖에서 오른쪽 밖으로 한 번 지나간다 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg]
                   bg-gradient-to-r from-transparent via-white/15 to-transparent
                   transition-[left] duration-700 ease-out group-hover:left-[150%]"
      />

      {/* 안쪽 테두리 — 호버에서만 살짝 밝아진다. 바깥 테두리를 건드리면 레이아웃이 흔들린다 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/0
                   transition-[box-shadow,--tw-ring-color] duration-300 group-hover:ring-white/25"
      />
    </div>
  );
}
