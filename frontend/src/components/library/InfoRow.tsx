/**
 * 게임 정보 한 줄.
 *
 * `overridden`이면 값 글씨를 **청록**으로 물들인다 — 마스터 원본과
 * 구분은 되어야 하는데(설계서 §3-6), 배지를 달면 표가 시끄러워진다.
 * 뭘 덮었는지 정확히 보는 건 편집 폼의 "마스터: ~" 힌트 몫이다 (API 설계서 §1.3)
 */
export default function InfoRow({
  label,
  value,
  overridden = false,
  first = false,
}: {
  label: string;
  value: React.ReactNode;
  overridden?: boolean;
  first?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-4 ${first ? "" : "border-t border-white/5 pt-3"}`}>
      <span className="flex shrink-0 items-center gap-1 text-white/50">{label}</span>
      <span
        /*
          덮어쓴 값은 **아주 옅게만** 물들인다. 진하게 칠하면 "경고"로 읽혀서
          직접 고친 게 잘못된 상태처럼 보인다 — 여기서 필요한 건 "이건 내가 적은 값"이라는
          귀띔이지 강조가 아니다. 마우스를 올리면 title이 이유를 말해준다
        */
        className={`text-right font-medium ${overridden ? "text-teal-200/70" : "text-white/90"}`}
        title={overridden ? "직접 수정하신 값입니다" : undefined}
      >
        {value}
      </span>
    </div>
  );
}
