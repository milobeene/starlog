/** 장르·태그 칩. onRemove가 있으면 × 버튼이 붙는다 */
export default function Chip({
  label,
  onRemove,
  rounded = false,
}: {
  label: string;
  onRemove?: () => void;
  rounded?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-white/10 px-2 py-0.5 text-[10px] text-white/70 ${
        rounded ? "rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/80" : "rounded"
      }`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${label} 제거`}
          className="text-white/50 transition-colors hover:text-white"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
