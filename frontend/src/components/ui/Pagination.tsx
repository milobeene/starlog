"use client";

/**
 * 페이지 번호는 0부터(백엔드 규약), 화면에는 1부터 보여준다.
 * 페이지가 많으면 현재 위치 주변만 남기고 `...`으로 접는다
 */
export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const slots = pageSlots(page, totalPages);

  return (
    <nav className="mt-12 mb-8 flex items-center justify-center space-x-2 text-sm">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        aria-label="이전 페이지"
        className="flex h-8 w-8 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        ‹
      </button>

      {slots.map((slot, index) =>
        slot === null ? (
          <span key={`gap-${index}`} className="px-1 text-white/30">
            …
          </span>
        ) : (
          <button
            key={slot}
            onClick={() => onChange(slot)}
            aria-current={slot === page ? "page" : undefined}
            className={
              slot === page
                ? "num flex h-8 w-8 items-center justify-center rounded bg-white/20 font-medium text-white"
                : "num flex h-8 w-8 items-center justify-center rounded text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            }
          >
            {slot + 1}
          </button>
        ),
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        aria-label="다음 페이지"
        className="flex h-8 w-8 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30"
      >
        ›
      </button>
    </nav>
  );
}

/** null은 `...` 자리다 */
function pageSlots(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const slots = new Set<number>([0, totalPages - 1, page]);
  if (page - 1 > 0) slots.add(page - 1);
  if (page + 1 < totalPages - 1) slots.add(page + 1);
  if (page <= 2) [1, 2, 3].forEach((n) => slots.add(n));
  if (page >= totalPages - 3) [totalPages - 4, totalPages - 3, totalPages - 2].forEach((n) => slots.add(n));

  const sorted = [...slots].filter((n) => n >= 0 && n < totalPages).sort((a, b) => a - b);

  const withGaps: (number | null)[] = [];
  sorted.forEach((slot, index) => {
    if (index > 0 && slot - sorted[index - 1] > 1) withGaps.push(null);
    withGaps.push(slot);
  });
  return withGaps;
}
