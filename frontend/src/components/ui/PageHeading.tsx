/** `[ LIBRARY ]` 꼬리표 + 제목 + 부제. 대시보드·라이브러리가 공유한다 */
export default function PageHeading({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    /* 폰에서는 right 슬롯(뷰 토글 등)이 제목 옆에 낄 자리가 없어 아래로 내린다 */
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col">
        <div className="mb-3 text-[10px] tracking-[0.2em] text-white/40 uppercase">
          [ {eyebrow} ]
        </div>
        <h1 className="mb-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="text-sm text-white/50">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
