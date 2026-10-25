"use client";

import { useState } from "react";
import { backendUrl } from "@/lib/apiBase";
import { placeholderUrl } from "@/lib/placeholder";

/**
 * 스크린샷·영상 썸네일 한 칸 (F5).
 *
 * ## 폴백 순서
 *
 * 썸네일(`thumbUrl`) → 원본(`url`) → 자리표시. 개발 서버(일렉트론 밖)는 `thumbUrl`이 null이고,
 * 일렉트론에서도 썸네일을 못 만들었으면 404일 수 있다 — 어느 단계에서
 * 막혀도 칸이 깨진 그림으로 남지 않게 한 단계씩 내려간다.
 *
 * 영상은 `<img>`에 원본을 못 넣는다. 썸네일이 없으면 `<video preload="metadata">`의 첫 프레임을 쓴다
 *
 * ## 흐린 자리표시 (LQIP)
 *
 * `placeholder`가 있으면 썸네일이 오기 전에 같은 칸을 흐린 색으로 채우고, 썸네일이 풀리면 위에서 서서히 나타난다.
 * 이미 캐시에 있던 썸네일(첫 프레임에 `complete`)은 페이드 없이 바로 — 다시 연 갤러리가 깜빡이지 않게
 */
export default function MediaThumb({
  thumbUrl,
  url,
  isVideo,
  alt,
  placeholder = null,
  onLoaded,
  className = "",
}: {
  thumbUrl: string | null;
  url: string;
  isVideo: boolean;
  alt: string;
  placeholder?: string | null;
  /** 썸네일(또는 대신 쓴 원본)이 그려졌다 — 속도 기록용 */
  onLoaded?: () => void;
  className?: string;
}) {
  /* 0 = 썸네일, 1 = 원본, 2 = 자리표시. 썸네일이 없으면 처음부터 1 */
  const [stage, setStage] = useState(thumbUrl ? 0 : 1);
  /* null = 아직, "instant" = 이미 캐시에 있었다, "fade" = 받아서 풀렸다 */
  const [loaded, setLoaded] = useState<null | "instant" | "fade">(null);
  const base = `h-full w-full object-cover ${className}`;
  const lqip = placeholderUrl(placeholder);

  if (stage === 0 && thumbUrl) {
    return (
      <span className="relative block h-full w-full">
        {lqip && loaded === null && (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-lqip src={lqip} alt="" aria-hidden draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={(el) => {
            if (el && el.complete && el.naturalWidth > 0 && loaded === null) setLoaded("instant");
          }}
          src={backendUrl(thumbUrl)}
          alt={alt}
          decoding="async"
          draggable={false}
          onLoad={() => {
            setLoaded((l) => l ?? "fade");
            onLoaded?.();
          }}
          onError={() => setStage(1)}
          className={`relative ${base} ${
            lqip && loaded !== "instant" ? `transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}` : ""
          }`}
        />
      </span>
    );
  }
  if (stage <= 1) {
    return isVideo ? (
      <video
        src={backendUrl(url)}
        preload="metadata"
        muted
        playsInline
        onLoadedData={() => onLoaded?.()}
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
        onLoad={() => onLoaded?.()}
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
