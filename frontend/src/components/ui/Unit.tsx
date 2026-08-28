/**
 * 숫자 뒤의 단위 — **본문 폰트로 뺀다** (2026-08-28).
 *
 * 숫자는 `.num`(JetBrains Mono)으로 그려야 자릿수가 안 흔들린다. 그런데 단위까지
 * 모노로 그리면 `KB`·`MB` 같은 영문이 균일 폭 규칙에 맞춰 벌어져 숫자보다 커 보인다.
 * 한글 단위(`장`·`자`)는 아예 글리프가 없어 OS 기본 고정폭으로 떨어진다.
 *
 * 단위는 값이 바뀌어도 **글자 수가 안 변하므로** 폭을 고정할 이유가 없다.
 * `MoneyText`가 통화 기호에 쓰는 것과 같은 판단이다.
 *
 * `font-sans`는 Switzer → Pretendard 순이라 **영문은 영문 폰트로, 한글은 한글 폰트로**
 * 각자 내려간다 — 단위마다 따로 지정할 필요가 없다.
 */
export default function Unit({
  children,
  /** 숫자와 붙는 한글 단위(`12장`)는 간격을 안 준다. `12 KB`처럼 이미 띄어 쓴 것도 마찬가지 */
  space = false,
}: {
  children: React.ReactNode;
  space?: boolean;
}) {
  return (
    <span className={`font-sans text-[0.92em] ${space ? "ml-[0.25em]" : ""}`}>{children}</span>
  );
}
