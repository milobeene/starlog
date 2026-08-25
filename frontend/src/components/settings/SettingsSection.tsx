import SectionIcon, { type IconName } from "@/components/ui/SectionIcon";

/** 설정 화면의 섹션 하나. 제목 + 오른쪽 액션 + 내용 */
export default function SettingsSection({
  title,
  icon,
  description,
  action,
  children,
}: {
  title: string;
  icon?: IconName;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b-line pb-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium text-white/90">
            {icon && <SectionIcon name={icon} />}
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-white/40">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
      {children}
    </li>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
      {children}
    </li>
  );
}
