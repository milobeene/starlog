"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComboOption = { value: string; label: string; count?: number };

/**
 * 입력 + 자동완성 목록. 사전(태그·장르·개발사…)이 있는 자리는 전부 이걸로 쓴다.
 *
 * 두 모드가 있다 —
 *   freeText: 사전에 없는 값도 그대로 쓴다 (개발사 검색). 입력한 글자가 곧 값이다.
 *             타이핑하는 글자로 **부분 일치** 필터링하고, 첫 항목이 강조된다.
 *             **목록에서 고르는 건 입력칸을 채울 뿐이다** — 적용은 입력칸에서 Enter(`onEnter`)로 한다.
 *             그래서 Enter가 두 일을 한다: 강조 항목이 입력과 다르면 채우고, 같으면 적용
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
  onEnter,
  className = "",
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  freeText?: boolean;
  /** freeText에서 입력칸이 이미 원하는 값일 때 Enter — "적용" 신호. 없으면 Enter는 채우기만 한다 */
  onEnter?: (value: string) => void;
  className?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  // 강조 항목. -1은 없음 — freeText에서 아무것도 안 쳤을 땐 Enter가 엉뚱한 첫 항목을 채우면 안 된다
  const [cursor, setCursor] = useState(freeText ? -1 : 0);
  // IME 조합 중인지. 조합 중 값을 프로그램이 바꾸면 마지막 음절이 빈 입력칸에 되살아난다
  const composingRef = useRef(false);
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
    if (!needle) return options;
    // 선택 전용만: 이미 고른 값과 같은 글자면 안 좁힌다 — 다시 열었을 때 전체가 보여야 한다.
    // freeText는 타이핑이 곧 value라 needle이 늘 value와 같다 → 이 가드를 타면 필터가 영영 안 된다
    if (!freeText && needle === labelOf(value).toLowerCase()) return options;
    const hits = options.filter((option) => option.label.toLowerCase().includes(needle));
    if (!freeText) return hits;
    // 완전 일치 → 앞부분 일치 → 중간 일치 순. 같은 등급 안에서는 사전 순서 그대로 (sort는 안정)
    const rank = (label: string) => {
      const text = label.toLowerCase();
      return text === needle ? 0 : text.startsWith(needle) ? 1 : 2;
    };
    return hits.sort((a, b) => rank(a.label) - rank(b.label));
  }, [options, query, value, freeText]);

  // 필터가 줄어 cursor가 끝을 넘었을 때를 대비해 쓰는 쪽은 항상 이 값을 본다
  const active = matches.length ? Math.min(cursor, matches.length - 1) : -1;

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

  // ↑↓로 목록 밖으로 나간 항목을 보이는 데로 끌어온다 (끝에서 멈추므로 어긋날 일은 없다)
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

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

  /*
   * 목록이 떠 있을 때의 Esc는 목록만 닫는다. Modal은 document 리스너라 React의 stopPropagation이
   * 안 닿는다 — Dropdown처럼 capture에서 끊어야 바깥 다이얼로그(입력 중인 칩까지)가 안 닫힌다
   */
  const listShown = open && matches.length > 0;
  const valueLabel = labelOf(value);
  useEffect(() => {
    if (!listShown) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.stopImmediatePropagation();
      setOpen(false);
      setQuery(valueLabel);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [listShown, valueLabel]);

  const commit = (option: ComboOption) => {
    // 조합 중에 값을 덮으면 IME가 마지막 음절을 다시 써넣는다 — blur가 조합을 먼저 확정시킨다.
    // (blur → compositionend → onChange가 먼저 돌고, 아래 값이 그걸 이긴다)
    const input = rootRef.current?.querySelector("input");
    const wasComposing = composingRef.current;
    if (wasComposing) input?.blur();
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    if (wasComposing) input?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // 한글 조합 중 Enter·화살표는 IME의 것이다. 크롬은 조합을 끝내는 Enter에 keydown을
    // 두 번 보낸다(isComposing:true 한 번, 진짜 Enter 한 번) — 앞의 것만 걸러야 한 번만 돈다
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setCursor(Math.max(active, 0));
        return;
      }
      // 끝에서 멈춘다 — 순환하면 마지막에서 ↓ 한 번에 첫 항목으로 튄다
      setCursor(
        event.key === "ArrowDown"
          ? Math.min(active + 1, matches.length - 1)
          : Math.max(active - 1, 0),
      );
    } else if (event.key === "Enter") {
      const picked = open && active >= 0 ? matches[active] : undefined;

      if (!freeText) {
        if (picked) {
          event.preventDefault();
          commit(picked);
        }
        return;
      }

      // 강조 항목이 입력과 다르면 채운다 (적용 아님). 같은 글자면 이미 채워진 것 → 아래서 적용
      if (picked && picked.label !== query) {
        event.preventDefault();
        commit(picked);
        return;
      }
      setOpen(false);
      if (onEnter) {
        event.preventDefault();
        onEnter(query);
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
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          // freeText는 글자가 있을 때만 첫 항목을 강조한다
          setCursor(freeText && !event.target.value.trim() ? -1 : 0);
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
          ref={listRef}
          className="menu-panel fixed z-[200] max-h-64 overflow-y-auto"
          style={{ left: rect.left, top: rect.top, width: rect.width }}
        >
          {matches.map((option, index) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                data-active={index === active}
                onMouseEnter={() => setCursor(index)}
                // onClick보다 먼저 도는 onMouseDown을 쓴다 — blur가 목록을 닫아버리기 전에 잡아야 한다
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option);
                }}
                className={`menu-item ${index === active ? "menu-item-active" : ""}`}
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
