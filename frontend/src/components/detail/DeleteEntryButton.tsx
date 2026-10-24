/** 항목 삭제. 데스크탑은 우측 열 끝, 폰은 화면 맨 아래에 같은 버튼이 놓인다 */
export default function DeleteEntryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded py-2.5 text-sm text-red-400 transition-all hover:bg-white/5"
    >
      Delete Entry
    </button>
  );
}
