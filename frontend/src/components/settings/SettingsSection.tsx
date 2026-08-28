import SectionIcon, { type IconName } from "@/components/ui/SectionIcon";

/** 설정 화면의 섹션 하나. 제목 + 오른쪽 액션 + 내용 */
export default function SettingsSection({
  title,
  icon,
  description,
  action,
  divider = "bottom",
  children,
}: {
  title: string;
  icon?: IconName;
  description?: string;
  action?: React.ReactNode;
  /**
   * 가르는 선을 위에 둘지 아래에 둘지.
   *
   * 기본은 아래다 — 섹션이 이어질 때 각자 제 밑에 선을 긋는 게 자연스럽다.
   * 아래에 그으면 화면 맨 밑에 주인 없는 선이 남으므로 **마지막 섹션은 그러면 안 된다.**
   *
   * ⚠️ `"none"`은 **바로 위 섹션이 이미 제 밑에 선을 그은 경우**다. 그때 `"top"`을 쓰면
   * 선이 두 겹으로 겹쳐 보인다 — "데이터 옮기기"를 시스템으로 옮기면서 실제로 그랬다.
   *
   * 여백도 안 준다. 위 섹션의 `pb-10`과 바깥 컨테이너의 gap이 이미 자리를 벌려놔서,
   * 여기서 `pt-10`을 더하면 그 사이만 유난히 벌어진다
   */
  divider?: "top" | "bottom" | "none";
  children: React.ReactNode;
}) {
  return (
    <section
      className={
        divider === "top" ? "border-t-line pt-10"
          : divider === "none" ? ""
            : "border-b-line pb-10"
      }
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-medium text-white/90">
            {icon && <SectionIcon name={icon} />}
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-white/40">{description}</p>}
        </div>
        {/* shrink-0 — 좁은 화면에서 "수정"이 "수 / 정"으로 쪼개지던 것을 막는다 */}
        {action && <div className="shrink-0 whitespace-nowrap">{action}</div>}
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
