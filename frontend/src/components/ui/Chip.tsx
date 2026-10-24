const BASE = "inline-flex items-center gap-1.5 bg-white/10 text-white/70";
const SIZE = {
  rounded: "rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/80",
  square: "rounded px-2 py-0.5 text-[10px]",
};

/**
 * 장르·태그 칩. onRemove가 있으면 **칩 전체가 지우기 버튼**이다.
 *
 * 예전엔 12px × 아이콘만 눌렀는데 맞추기 어려웠다. 칩 자체를 `<button>`으로 두면
 * 히트박스가 칩 크기가 되고, Tab 포커스·Enter/Space도 그대로 따라온다.
 * 호버하면 붉게 바뀌어 "누르면 사라진다"를 알린다
 */
export default function Chip({
  label,
  onRemove,
  rounded = false,
  className = "",
}: {
  label: string;
  onRemove?: () => void;
  rounded?: boolean;
  /** 폭에 따라 숨기는 것처럼 바깥에서 표시를 제어할 때 */
  className?: string;
}) {
  const size = rounded ? SIZE.rounded : SIZE.square;

  if (!onRemove) {
    return <span className={`${BASE} ${size} ${className}`}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${label} 제거`}
      className={`${BASE} ${size} group cursor-pointer transition-colors hover:border-red-400/30 hover:bg-red-500/15 hover:text-red-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/40 ${className}`}
    >
      {label}
      <svg
        className="h-3 w-3 text-white/50 transition-colors group-hover:text-red-300"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
