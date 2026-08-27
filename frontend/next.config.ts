import type { NextConfig } from "next";

/**
 * 데스크탑(v1.0) 빌드에서만 정적 내보내기로 바꾼다.
 *
 * 항상 켜지 않는 이유 — `output: "export"`는 서버 기능을 전부 끈다.
 *   STARLOG_DESKTOP=1 npm run build   → out/ 에 정적 파일
 *   npm run dev                        → 개발 서버 (아래 프록시가 붙는다)
 */
const desktop = process.env.STARLOG_DESKTOP === "1";

/** 개발 중 백엔드 주소. 프록시 대상이라 브라우저에는 안 드러난다 */
const DEV_BACKEND = process.env.STARLOG_DEV_BACKEND ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  ...(desktop
    ? {
        output: "export" as const,
        // 정적 내보내기는 이미지 최적화 서버가 없다
        images: { unoptimized: true },
        // 스프링이 프론트까지 서빙하므로 오리진이 하나다 → API를 상대 경로로 (lib/apiBase.ts)
        env: { NEXT_PUBLIC_SAME_ORIGIN: "1" },
      }
    : {
        /*
         * ## 개발 서버가 /api 를 백엔드로 넘긴다 (v1.0)
         *
         * 예전엔 프론트(:3000)가 백엔드(:8080)를 **직접** 불렀고, 그래서 CORS 설정이
         * 필요했다. v1.0에서 인증과 함께 CORS도 걷어냈는데 — 실사용(일렉트론)에서는
         * 스프링이 프론트까지 서빙해 오리진이 하나라 애초에 CORS가 없기 때문이다.
         *
         * **개발만 교차 오리진으로 남는 건 앞뒤가 안 맞는다.** 그래서 서버 설정을
         * 되살리는 대신 개발 서버가 프록시하게 했다 — 브라우저 입장에서는 :3000 하나뿐이고,
         * 프론트는 어디서든 상대 경로만 쓰면 된다(프로덕션과 같은 코드 경로).
         */
        env: { NEXT_PUBLIC_SAME_ORIGIN: "1" },
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${DEV_BACKEND}/api/:path*` }];
        },
      }),
};

export default nextConfig;
