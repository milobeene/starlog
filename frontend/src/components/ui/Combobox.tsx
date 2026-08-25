"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComboOption = { value: string; label: string; count?: number };

/**
 * 입력 + 자동완성 목록. 사전(태그·장르·개발사…)이 있는 자리는 전부 이걸로 쓴다.
 *
 * 두 모드가 있다 —
 *   freeText: 사전에 없는 값도 그대로 쓴다 (개발사 검색). 입력한 글자가 곧 값이다
 *   선택 전용: 목록에 있는 것만 값이 된다 (기기·플랫폼). 표시는 이름, 값은 id다
 *
 * 화살표·Enter·Esc를 직접 처리하는 이유 — datalist는 스타일을 못 입히고
 * 브라우저마다 동작이 달라서 어두운 테마에서 흰 팝업이 튀어나온다.
 *
 * **목록은 body로 포털한다.** 다이얼로그 안에서 쓰면 모달의 overflow-y-auto에 잘려
 * 스크롤해야 보인다. fixed로 띄우고 입력칸 위치를 재서 붙인다
 */
export default function Combobox({
  options,
  value,
  onChange,
  placeholder,
  freeText = false,
  className = "",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  freeText?: boolean;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  /** 표시 문자열 — 선택 전용 모드에서는 value가 id라 라벨로 되돌려야 한다 */
  const labelOf = (raw: string) =>
    freeText ? raw : (options.find((option) => option.value === raw)?.label ?? "");

  const [query, setQuery] = useState(() => labelOf(value));
  const [seen, setSeen] = useState({ value, options });

  // 바깥에서 초기화(Clear)하거나 옵션이 늦게 도착하면 표시도 따라가야 한다.
  // effect가 아니라 렌더 중 비교 — 옵션이 늦게 오는 자리라 한 프레임 늦으면 빈칸이 보인다
  if (seen.value !== value || seen.options !== options) {
    setSeen({ value, options });
    setQuery(labelOf(value));
  }

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // 이미 고른 값과 같은 글자면 목록을 안 좁힌다 — 다시 열었을 때 전체가 보여야 한다
    if (!needle || needle === labelOf(value).toLowerCase()) return options;
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query, value]);

  /**
   * 입력칸 좌표를 재서 목록을 그 아래 붙인다.
   * 아래 공간이 모자라면 위로 뒤집는다 — 모달 하단의 필드가 화면 밖으로 나가는 걸 막는다.
   * useLayoutEffect라 페인트 전에 자리를 잡아 깜빡이지 않는다
   */
  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const input = rootRef.current?.querySelector("input");
      if (!input) return;
      const box = input.getBoundingClientRect();
      setRect({ left: box.left, top: box.bottom + 4, width: box.width });
    };

    measure();
    window.addEventListener("resize", measure);
    // 캡처 단계로 듣는다 — 스크롤은 버블링하지 않아 조상 컨테이너의 스크롤을 놓친다
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      // 포털된 목록은 rootRef 밖이라 따로 봐야 한다
      const inList = (target as HTMLElement).closest?.("[data-combobox-list]");
      if (!rootRef.current?.contains(target) && !inList) {
        setOpen(false);
        setQuery(labelOf(value));
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, value, options]);

  const commit = (option: ComboOption) => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setCursor((prev) => (prev + delta + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === "Enter") {
      if (open && matches[cursor]) {
        event.preventDefault();
        commit(matches[cursor]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(labelOf(value));
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(0);
          setOpen(true);
          // 자유 입력은 타이핑이 곧 값이다. 선택 전용은 골라야 값이 바뀐다
          if (freeText) onChange(event.target.value);
          else if (event.target.value === "") onChange("");
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={className}
      />

      {/* 값이 있으면 지우기 버튼 — 선택 전용 모드는 이게 없으면 되돌릴 방법이 없다 */}
      {query && (
        <button
          type="button"
          aria-label="지우기"
          onClick={() => {
            onChange("");
            setQuery("");
            setOpen(false);
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-white/30 transition-colors hover:text-white"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {open &&
        matches.length > 0 &&
        rect &&
        createPortal(
        <ul
          id={listId}
          role="listbox"
          data-combobox-list
          className="menu-panel fixed z-[200] max-h-64 overflow-y-auto"
          style={{ left: rect.left, top: rect.top, width: rect.width }}
        >
          {matches.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onMouseEnter={() => setCursor(index)}
                // onClick보다 먼저 도는 onMouseDown을 쓴다 — blur가 목록을 닫아버리기 전에 잡아야 한다
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
                className={`menu-item ${index === cursor ? "menu-item-active" : ""}`}
              >
                <span className="truncate">{option.label}</span>
                {option.count != null && (
                  <span className="num shrink-0 text-[11px] text-white/30">{option.count}</span>
                )}
              </button>
            </li>
          ))}
        </ul>,
          document.body,
        )}
    </div>
  );
}
