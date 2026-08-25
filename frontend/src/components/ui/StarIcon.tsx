/** 속이 빈 별 + 둥근 끝. fill이 아니라 stroke라 배경이 비친다 */
export default function StarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.14 1 5.86L12 16.94l-5.25 2.76 1-5.86L3.5 9.7l5.9-.9z" />
    </svg>
  );
}
