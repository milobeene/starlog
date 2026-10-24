"use client";

import { useState } from "react";
import { backendUrl } from "@/lib/apiBase";

/**
 * 스크린샷·영상 썸네일 한 칸 (F5).
 *
 * ## 폴백 순서
 *
 * 썸네일(`thumbUrl`) → 원본(`url`) → 자리표시. 개발 서버(일렉트론 밖)는 `thumbUrl`이 null이고,
 * 일렉트론에서도 썸네일이 아직 안 만들어졌거나 `/thumb`이 404일 수 있다 — 어느 단계에서
 * 막혀도 칸이 깨진 그림으로 남지 않게 한 단계씩 내려간다.
 *
 * 영상은 `<img>`에 원본을 못 넣는다. 썸네일이 없으면 `<video preload="metadata">`의 첫 프레임을 쓴다
 */
export default function MediaThumb({
  thumbUrl,
  url,
  isVideo,
  alt,
  className = "",
}: {
  thumbUrl: string | null;
  url: string;
  isVideo: boolean;
  alt: string;
  className?: string;
}) {
  /* 0 = 썸네일, 1 = 원본, 2 = 자리표시. 썸네일이 없으면 처음부터 1 */
  const [stage, setStage] = useState(thumbUrl ? 0 : 1);
  const base = `h-full w-full object-cover ${className}`;

  if (stage === 0 && thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={backendUrl(thumbUrl)}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setStage(1)}
        className={base}
      />
    );
  }
  if (stage <= 1) {
    return isVideo ? (
      <video
        src={backendUrl(url)}
        preload="metadata"
        muted
        playsInline
        onError={() => setStage(2)}
        className={base}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={backendUrl(url)}
        alt={alt}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setStage(2)}
        className={base}
      />
    );
  }
  return (
    <div className="image-placeholder flex h-full w-full items-center justify-center text-[11px] text-white/25">
      {isVideo ? "영상" : "이미지"}
    </div>
  );
}

/** 영상 표시 — 목록에서는 재생하지 않으므로 재생 모양 하나로 "영상"임을 알린다 */
export function PlayBadge() {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/90">
        ▶
      </span>
    </span>
  );
}
