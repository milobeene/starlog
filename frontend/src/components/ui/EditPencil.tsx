/**
 * 상세 화면 카드·요약 줄의 연필 버튼.
 *
 * 예전 `Field`의 `EditButton`(24px)은 손으로 맞추기 작아서 실기에서 지적받았다. 36px 칸에 16px 아이콘.
 * 제목 줄에 놓을 때는 `className`에 음수 마진(`-my-2 -mr-2`)을 줘서 줄 높이와 아이콘 정렬을 지킨다
 */
export default function EditPencil({
  onClick,
  label,
  className = "",
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/10 hover:text-white ${className}`}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </button>
  );
}
