/**
 * Neon이 5분 유휴면 잠든다 — 첫 요청이 몇 초 걸려서 이게 실제로 보인다.
 * 장식이 아니라 기능이다
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />;
}

export function CardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col">
          <Skeleton className="mb-3 aspect-[3/4] w-full rounded-xl" />
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** 대시보드 가로 목록의 자리지킴 — GameRow와 **같은 --card 식**을 써야 뜰 때 안 튄다 */
export function RowSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-flow-col gap-4 overflow-hidden auto-cols-[var(--card)] [--card:calc((100%_-_5rem)_/_6)] lg:[--card:calc((100%_-_7rem)_/_8)] xl:[--card:calc((100%_-_9rem)_/_10)]">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col">
          <Skeleton className="mb-4 aspect-[3/4] w-full rounded-xl" />
          <Skeleton className="mb-1 h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
