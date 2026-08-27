import type { NextConfig } from "next";

/**
 * 데스크탑(v1.0) 빌드에서만 정적 내보내기로 바꾼다.
 *
 * 항상 켜지 않는 이유 — `output: "export"`는 서버 기능을 전부 끈다.
 * 웹 개발/배포 경로를 건드리지 않으려고 환경변수로 가른다:
 *   STARLOG_DESKTOP=1 npm run build   → out/ 에 정적 파일
 *   npm run build                      → 지금까지와 동일
 */
const desktop = process.env.STARLOG_DESKTOP === "1";

const nextConfig: NextConfig = {
  ...(desktop
    ? {
        output: "export" as const,
        // 정적 내보내기는 이미지 최적화 서버가 없다
        images: { unoptimized: true },
        // 스프링이 프론트까지 서빙하므로 오리진이 하나다 → API를 상대 경로로 (lib/apiBase.ts)
        env: { NEXT_PUBLIC_SAME_ORIGIN: "1" },
      }
    : {}),
};

export default nextConfig;
