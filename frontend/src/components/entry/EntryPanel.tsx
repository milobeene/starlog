"use client";

/**
 * 입구 화면의 패널 껍데기 — 제목 + 뒤로.
 *
 * 모드 선택 다음의 모든 단계가 같은 틀을 쓴다. 화면마다 헤더를 다시 짜면
 * 여백과 글자 크기가 조금씩 어긋나서 **같은 화면인데 계단이 생긴다**
 */
export default function EntryPanel({
  title,
  subtitle,
  onBack,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  /*
   * 유리판 위에 올린다 — 배경(FluidBackground)이 밝은 파스텔이라 **폼이 통째로 묻힌다.**
   * 표지 한 장이던 v0.1에서는 큰 글자와 버튼 둘뿐이라 안 드러났던 문제다.
   * 값은 모달과 같은 것(`glass-panel` + `bg-neutral-950/92`)을 쓴다 —
   * 입구만 다른 판을 쓰면 앱에 들어가는 순간 재질이 바뀐다
   */
  return (
    <div className="glass-panel w-full max-w-lg rounded-xl !bg-neutral-950/92 px-6 py-5 text-left sm:px-7 sm:py-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-white/90">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-white/40">{subtitle}</p>}
        </div>
        <button
          onClick={onBack}
          className="shrink-0 text-[11px] tracking-widest text-white/40 uppercase transition-colors hover:text-white"
        >
          뒤로
        </button>
      </div>
      {children}
    </div>
  );
}
