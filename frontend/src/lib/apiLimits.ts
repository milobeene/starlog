/**
 * 외부 API 한도 — **서버가 아니라 여기 있다** (v1.0 8단계, 사용자 결정 2026-08-28).
 *
 * ## 왜 코드에 적어두나
 *
 * 벤더가 언제든 바꾸고 **우리가 조회할 방법이 없다.** 서버가 숫자를 계산해서 주면
 * 그게 "지금 사실"처럼 보이는데 실은 누군가 예전에 적어둔 값이다 — 조용히 거짓말이 된다.
 *
 * 그래서 값과 **기준일을 붙여서** 화면에 함께 띄운다. "초당 4회 (2026-08 기준)"이면
 * 읽는 사람이 스스로 의심할 수 있다. 숫자만 있으면 그럴 수가 없다.
 *
 * 갱신할 일이 생기면 `checkedOn`도 같이 고칠 것.
 */
export type ApiLimit = {
  label: string;
  /** 사람이 읽는 한도 설명. 창(초·월)이 서로 달라 숫자 하나로 못 담는다 */
  limits: string[];
  checkedOn: string;
  docs: string;
};

export const API_LIMITS: Record<string, ApiLimit> = {
  IGDB: {
    label: "외부 게임 DB API (IGDB)",
    limits: ["초당 4회", "동시 8건", "월 한도 없음"],
    checkedOn: "2026-08",
    docs: "https://api-docs.igdb.com",
  },
  STORAGE: {
    label: "커버 스토리지 API (S3 호환)",
    /*
     * 벤더마다 다르다 — R2·S3·MinIO·B2가 각자 다른 단위로 센다.
     * **하나를 골라 적으면 다른 걸 쓰는 사람에게 틀린 말이 된다.** 그래서 안 적는다
     */
    limits: ["벤더마다 다릅니다 — 쓰시는 서비스의 요금제를 확인하세요"],
    checkedOn: "—",
    docs: "",
  },
};
