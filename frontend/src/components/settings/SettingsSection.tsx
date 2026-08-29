"use client";

import { useEffect, useRef, useState } from "react";
import SectionIcon, { type IconName } from "@/components/ui/SectionIcon";

/**
 * 길어지면 접는다 (v1.1, 2026-08-29).
 *
 * 프로필 화면이 아래로 한없이 길어져서 구독을 보려면 한참 굴려야 했다.
 *
 * 높이는 **3.5행**이다 (2026-08-29, 사용자 지정). 8.5행은 접은 티가 안 날 만큼 길었다.
 * 네 번째 줄이 **딱 절반만** 보이게 갭까지 계산한다 — 어중간하게 잘린 반 줄이
 * "더 있다"를 말한다. 딱 떨어지게 자르면 거기가 끝인 줄 안다.
 *
 * 행 하나 = 44px(패딩 포함) + gap 8px. 3행 + 갭 3개 + 반 행 = 44*3 + 8*3 + 22 = 178
 *
 * ⚠️ **넘칠 때만 버튼이 뜬다.** 항상 띄우면 다 보이는데도 누를 게 있어 헷갈린다.
 * 잘림 판정은 그려진 뒤에야 알 수 있어 ResizeObserver로 잰다 — 창 크기가 바뀌어도 다시 잰다
 */
export const COLLAPSED_MAX_PX = 178;

export function Collapsible({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollHeight > COLLAPSED_MAX_PX + 8);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div>
      <div
        ref={ref}
        className={open ? "" : "overflow-hidden"}
        style={open ? undefined : { maxHeight: COLLAPSED_MAX_PX }}
      >
        {children}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 text-[11px] text-white/35 transition-colors hover:text-white"
        >
          {open ? "접기" : "전체 보기"}
        </button>
      )}
    </div>
  );
}

/** 설정 화면의 섹션 하나. 제목 + 오른쪽 액션 + 내용 */
export default function SettingsSection({
  title,
  icon,
  description,
  action,
  divider = "bottom",
  collapsible,
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
  /** 내용이 길면 접는다. 목록이 붙는 섹션에 켠다 */
  collapsible?: boolean;
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
      {collapsible ? <Collapsible>{children}</Collapsible> : children}
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
