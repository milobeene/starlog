"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeBelow, type AnchorPlacement } from "@/lib/anchorPosition";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 패널 크기는 고정이라 미리 안다 — 그려 보고 재면 한 프레임 깜빡인다 */
const PANEL_W = 256;
const PANEL_H = 330;

/**
 * 날짜 입력 — **브라우저 기본 달력을 우리 것으로 갈아끼운다.**
 *
 * `<input type="date">`의 팝업은 OS/브라우저가 그려서 CSS가 안 닿는다. 어두운 화면에
 * 흰 판이 튀어나오고 서체도 우리 것이 아니었다.
 *
 * **기능은 브라우저가 하던 것까지만이다** — 월 이동, 날짜 고르기, 오늘 표시, 지우기.
 * 범위 선택·프리셋·키보드 단축키는 넣지 않는다. 없던 기능을 새로 만드는 게 아니라
 * 같은 기능을 우리 색으로 그리는 게 목적이다.
 *
 * 값은 `yyyy-MM-dd` 문자열 그대로다 — 서버가 LocalDate를 그 모양으로 주고받는다.
 * Date 객체로 바꾸면 타임존 때문에 하루가 밀리는 고전적인 함정이 생긴다
 */
export default function DateField({
  value,
  onChange,
  placeholder = "날짜 선택",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<AnchorPlacement | null>(null);

  /** 보고 있는 달. 값이 있으면 그 달에서 시작한다 */
  const [cursor, setCursor] = useState(() => monthOf(value));
  /** 연도 격자를 띄웠나. 달력을 닫을 때 함께 접는다 — 다시 열면 달력부터가 자연스럽다 */
  const [yearPicker, setYearPicker] = useState(false);

  /** 그려졌으면 실제 높이로, 아니면 추정치로. 달의 주 수(5·6)에 따라 34px이 갈린다 */
  const panelSize = () => {
    const measured = panelRef.current?.getBoundingClientRect();
    return { width: PANEL_W, height: measured?.height || PANEL_H };
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-datefield-panel]")) return;
      setOpen(false);
    };
    /*
     * **전파를 끊는다.** 안 끊으면 Esc 한 번이 달력과 다이얼로그를 같이 닫아
     * 편집하던 내용이 통째로 날아간다 — Modal도 같은 document에 리스너를 달기 때문이다.
     * 같은 노드의 다른 리스너는 stopPropagation으로 못 막으므로 즉시 중단이어야 한다
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    };

    /*
     * 스크롤·리사이즈를 따라간다. 없으면 모달 본문이나 관리자 목록을 스크롤할 때
     * **앵커만 움직이고 달력은 제자리에 남아** 엉뚱한 필드 위에 떠 있게 된다
     */
    const reposition = () => {
      const anchor = rootRef.current?.getBoundingClientRect();
      if (anchor) setPlace(placeBelow(anchor, panelSize(), "left"));
    };

    // capture로 듣는다 — 스크롤은 버블링하지 않아 조상 컨테이너의 것을 놓친다
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  /*
   * 패널을 body로 뺀다. 다이얼로그가 overflow-y-auto라 안에 두면 달력이 잘린다 —
   * 그려진 뒤에 재면 (0,0)에 한 프레임 스쳤다 옮겨가므로 useLayoutEffect다.
   *
   * **아래 공간이 모자라면 위로 뒤집는다** — 다이얼로그 하단의 날짜 칸을 누르면
   * 달력이 화면 밖으로 내려가 절반이 잘렸다 (placeBelow가 그 판단을 한다)
   */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = rootRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setPlace(placeBelow(anchor, panelSize(), "left"));
  }, [open, cursor]);


  const today = todayString();
  const days = monthGrid(cursor);

  /*
   * 연도 고르기 (2026-08-29).
   *
   * **한 달씩 넘기는 버튼만으로는 못 간다.** 2015년에 산 게임을 적으려면 130번을 눌러야 한다.
   * 헤더를 눌러 연도 격자를 띄우고, 고르면 **그 해 1월**로 간다 —
   * 달까지 기억해두면 "2015년 8월"에서 연도만 바꿨을 때 8월이 튀어나와 헷갈린다
   */
  const yearBase = cursor.year - (((cursor.year % 12) + 12) % 12);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          // 여는 순간 값의 달로 되돌린다. 3월을 보다 닫았는데 다시 열어도 3월이면 헷갈린다.
          // effect가 아니라 여기서 하는 이유 — 상태 초기화는 "그 일이 일어난 곳"이 제자리다
          if (!open) {
            setCursor(monthOf(value));
            setYearPicker(false);
          }
          setOpen(!open);
        }}
        className={`flex w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left text-sm transition-colors hover:border-white/25 focus:border-white/30 focus:outline-none ${className}`}
      >
        <span className={value ? "num text-white" : "text-white/25"}>{value || placeholder}</span>

        <span className="flex items-center gap-1">
          {value && (
            /*
             * 안에 button을 중첩하면 HTML이 깨진다 — span에 역할을 준다.
             * stopPropagation이 없으면 바깥 버튼까지 눌려 지우면서 달력이 열린다
             */
            <span
              role="button"
              tabIndex={0}
              aria-label="지우기"
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.stopPropagation();
                onChange("");
              }}
              className="text-white/30 transition-colors hover:text-white/80"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          )}
          <svg className="h-4 w-4 text-white/35" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </span>
      </button>

      {open &&
        place &&
        createPortal(
          <div
            ref={panelRef}
            data-datefield-panel
            /*
              menu-panel은 @layer 밖이라 Tailwind 유틸리티를 이긴다 —
              여기에 p-3를 얹어봐야 안 먹는다. 필요한 것만 직접 지정한다
            */
            className="fixed z-[60] w-64 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 p-3 shadow-xl"
            style={{ top: place.top, left: place.left, maxHeight: place.maxHeight }}
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="이전 달"
                onClick={() => setCursor(addMonths(cursor, -1))}
                className="flex h-7 w-7 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setYearPicker((on) => !on)}
                className="num rounded px-2 py-0.5 text-sm font-medium transition-colors hover:bg-white/10"
              >
                {cursor.year}. {String(cursor.month).padStart(2, "0")}
              </button>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() => setCursor(addMonths(cursor, 1))}
                className="flex h-7 w-7 items-center justify-center rounded text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                ›
              </button>
            </div>

            {yearPicker ? (
              <div className="grid grid-cols-4 gap-1 py-1">
                {Array.from({ length: 12 }, (_, i) => yearBase + i).map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => {
                      // 그 해 1월로. 달을 유지하면 연도만 바꿨을 때 엉뚱한 달이 나온다
                      setCursor({ year, month: 1 });
                      setYearPicker(false);
                    }}
                    className={`num h-9 rounded text-xs transition-colors ${
                      year === cursor.year
                        ? "bg-white/15 text-white"
                        : "text-white/60 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            ) : (
            <>
            <div className="mb-1 grid grid-cols-7 gap-0.5">
              {WEEKDAYS.map((day, index) => (
                <span
                  key={day}
                  className={`flex h-6 items-center justify-center text-[10px] ${
                    index === 0 ? "text-red-400/60" : "text-white/30"
                  }`}
                >
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day, index) =>
                day === null ? (
                  // 빈 칸도 자리는 차지해야 요일 열이 안 밀린다
                  <span key={`pad-${index}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(day);
                      setOpen(false);
                    }}
                    className={`num flex h-8 items-center justify-center rounded text-xs transition-colors ${
                      day === value
                        ? "bg-white font-semibold text-black"
                        : day === today
                          ? "text-white ring-1 ring-white/40 ring-inset hover:bg-white/10"
                          : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {Number(day.slice(8))}
                  </button>
                ),
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onChange(today);
                setOpen(false);
              }}
              className="mt-2 w-full rounded px-2 py-1.5 text-[11px] tracking-widest text-white/45 uppercase transition-colors hover:bg-white/10 hover:text-white"
            >
              오늘
            </button>
            </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ── 날짜 계산. Date 객체를 안 쓰는 이유는 위 주석 참고 ───────────── */

type Month = { year: number; month: number };

function monthOf(value: string): Month {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    // 정규식은 자릿수만 본다. `2026-13-01`이 들어오면 13월 31칸을 그려 서버가 400을 준다
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function addMonths({ year, month }: Month, delta: number): Month {
  const total = year * 12 + (month - 1) + delta;
  // JS의 %는 나머지 부호가 피제수를 따라간다 — `-1 % 12 === -1`이라 그냥 쓰면 month가 0이 된다
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 그 달의 칸 배열. 앞쪽 빈 칸은 null이다.
 *
 * `new Date(year, month, 0)`이 **그 달의 마지막 날**을 준다 — 월 길이를 표로 들고
 * 윤년을 직접 따지는 것보다 안전하다
 */
function monthGrid({ year, month }: Month): (string | null)[] {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();

  const cells: (string | null)[] = Array(firstWeekday).fill(null);
  for (let date = 1; date <= lastDate; date++) {
    cells.push(`${year}-${pad(month)}-${pad(date)}`);
  }
  return cells;
}
