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
    <div className="flex min-h-[7.5rem] flex-col justify-between gap-3 px-10 py-6">
      <div className="text-xs font-medium tracking-wider text-white/50 uppercase">{label}</div>
      <div>
        <div className="num mb-1 text-5xl font-light tracking-tighter">
          {value}
          {unit && <span className="text-4xl text-white/60">{unit}</span>}
        </div>
        {hint && <div className="truncate text-sm text-white/40">{hint}</div>}
        {children}
      </div>
    </div>
  );
}
