"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { backendUrl } from "@/lib/apiBase";

/**
 * 메모 마크다운을 그리는 단 한 곳 (보안 점검 2026-10-25).
 *
 * 메모는 IGDB·가져오기(JSON)·클라우드 DB를 거쳐 **남이 쓴 글이 들어올 수 있다.**
 * 링크를 그냥 두면 클릭 한 번에 본 창이 남의 페이지로 넘어가고, 그 페이지가 창의 다리를 쥔다.
 * 그래서 링크는 늘 새 창(→ 일렉트론이 기본 브라우저로 넘긴다), 이미지는 정해진 곳만 불러온다 —
 * 외부 이미지는 여는 순간 "이 사람이 지금 이 메모를 봤다"를 남에게 알린다 (사용자 결정: 막는다)
 */

/** 링크로 살려두는 주소. 나머지(file:, smb:, 상대 경로 …)는 글자로만 남긴다 */
function externalHref(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    return ["https:", "http:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * 우리 서버에서 불러와도 되는 이미지 — 커버 파일과 스크린샷(원본·썸네일)만.
 * `/api/` 아래 아무 GET이나 열어 두면 메모 한 줄이 앱 토큰을 단 요청을 아무 데나 쏘게 된다.
 * `..`·인코딩된 `/`는 경로를 빠져나갈 수 있어 통째로 거른다
 */
const OWN_IMAGE = [
  /^\/api\/backlog\/\d+\/cover\/file(\?[^#]*)?$/,
  /^\/api\/backlog\/\d+\/screenshots\/[^/?#]+(\/thumb)?(\?[^#]*)?$/,
];

/** 불러와도 되는 이미지. IGDB 커버와 우리 서버의 커버·스크린샷뿐 */
function allowedImage(src: string | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("/")) {
    if (/\.\.|%2f|%5c|\\/i.test(src)) return null;
    return OWN_IMAGE.some((pattern) => pattern.test(src)) ? backendUrl(src) : null;
  }
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.hostname === "images.igdb.com" ? url.href : null;
  } catch {
    return null;
  }
}

const components: Components = {
  a({ href, children }) {
    const safe = externalHref(href);
    if (!safe) return <span>{children}</span>;
    return (
      <a href={safe} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  img({ src, alt }) {
    const raw = typeof src === "string" ? src : undefined;
    const safe = allowedImage(raw);
    // eslint-disable-next-line @next/next/no-img-element -- 정적 내보내기라 next/image 최적화가 없다
    if (safe) return <img src={safe} alt={alt ?? ""} />;
    const href = externalHref(raw);
    const label = alt || raw || "이미지";
    return href ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    ) : (
      <span>{label}</span>
    );
  },
};

export default function Markdown({ children }: { children: string | null | undefined }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children ?? ""}
    </ReactMarkdown>
  );
}
