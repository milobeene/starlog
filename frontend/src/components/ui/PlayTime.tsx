import Unit from "@/components/ui/Unit";
import { playTimeParts } from "@/lib/format";

/**
 * 플레이 시간 — `10시간 45분`. 숫자는 `.num`(모노), 단위는 본문 폰트다 (`Unit`).
 * 변환 규칙은 `lib/format.ts`의 `playTimeParts`가 갖는다. 문자열이 필요하면 `formatPlayTime`.
 *
 * 값이 없으면(null) `empty`를 그대로 보인다
 */
export default function PlayTime({
  hours,
  empty = "—",
  unitClassName = "",
}: {
  hours: number | null | undefined;
  empty?: React.ReactNode;
  /** 큰 숫자 옆 단위를 옅게 하는 것처럼 단위만 따로 꾸밀 때 */
  unitClassName?: string;
}) {
  const parts = playTimeParts(hours);
  if (!parts) return <>{empty}</>;

  const unit = (text: string) => (
    <span className={unitClassName}>
      <Unit>{text}</Unit>
    </span>
  );
  const number = (value: number) => <span className="num">{value.toLocaleString("ko-KR")}</span>;

  // 1시간 미만은 분만, 분이 0이면 시간만 — 0시간·0분을 굳이 적지 않는다
  const showHours = parts.hours > 0;
  const showMinutes = parts.minutes > 0 || !showHours;

  return (
    // 줄바꿈을 막는다 — 칸이 좁을 때 `22분`만 아랫줄로 떨어지면 다른 수치와 높이가 어긋난다
    <span className="whitespace-nowrap">
      {showHours && (
        <>
          {number(parts.hours)}
          {unit("시간")}
        </>
      )}
      {/* 공백 글자는 모노 폭이라 너무 벌어진다 — 얇은 간격으로 */}
      {showHours && showMinutes && <span className="inline-block w-[0.3em]" />}
      {showMinutes && (
        <>
          {number(parts.minutes)}
          {unit("분")}
        </>
      )}
    </span>
  );
}
