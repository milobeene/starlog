/** 요약 타일. 두 번째 타일만 안에 목록이 들어가서 children으로 받는다 */
export default function StatTile({
  label,
  value,
  unit,
  hint,
  children,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-x flex min-h-[6rem] flex-col justify-between gap-2 py-5 sm:min-h-[7.5rem] sm:gap-3 sm:py-6">
      <div className="text-xs font-medium tracking-wider text-white/50 uppercase">{label}</div>
      <div>
        <div className="num mb-1 text-3xl font-light tracking-tighter sm:text-4xl lg:text-5xl">
          {value}
          {unit && <span className="text-2xl text-white/60 sm:text-3xl lg:text-4xl">{unit}</span>}
        </div>
        {hint && <div className="truncate text-sm text-white/40">{hint}</div>}
        {children}
      </div>
    </div>
  );
}
