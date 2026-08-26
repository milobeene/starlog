"use client";

import { useRef } from "react";
import { FIELD_INPUT } from "./Field";

/** `- `, `* `, `1. `, `- [ ] ` 앞의 들여쓰기까지 잡는다 */
const LIST_LINE = /^(\s*)([-*+]\s\[[ xX]\]\s|[-*+]\s|(\d+)\.\s)(.*)$/;
const INDENT = "  ";

/**
 * 메모 입력칸. 마크다운 목록을 손으로 다시 치지 않게 돕는다.
 *
 *   Enter      목록 안이면 다음 항목을 이어 붙인다. 빈 항목에서 누르면 목록을 끝낸다
 *   Tab        들여쓰기 (Shift+Tab은 내어쓰기)
 *
 * 에디터 라이브러리를 안 들이는 이유 — 필요한 건 이 두 가지뿐이고,
 * textarea를 유지해야 브라우저 맞춤법·되돌리기가 그대로 산다
 */
export default function MarkdownTextarea({
  value,
  onChange,
  rows = 10,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** 값을 바꾸고 커서를 원하는 자리에 둔다 — React가 다시 그린 뒤라 다음 프레임에 옮긴다 */
  const apply = (next: string, caret: number) => {
    onChange(next);
    requestAnimationFrame(() => {
      const node = ref.current;
      if (node) node.setSelectionRange(caret, caret);
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const node = event.currentTarget;
    const { selectionStart: start, selectionEnd: end } = node;

    /*
     * **한글(IME) 조합 중에는 손대지 않는다.**
     *
     * 조합 중 Enter는 두 번 온다 — 먼저 "조합을 확정하는 Enter", 그다음 "줄바꿈 Enter".
     * 둘 다 목록 로직을 태우면 항목이 한 번에 두 줄 생기고, 첫 줄에 마지막 글자만 남은 채
     * 커서는 그다음 줄에 가 있었다. 조합 확정은 브라우저에 맡기고 두 번째만 처리한다.
     *
     * 영문은 조합 자체가 없어서 이 분기에 걸리지 않는다 — 그래서 한글에서만 났다
     */
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;

      if (event.shiftKey) {
        // 내어쓰기 — 줄머리의 공백을 최대 INDENT만큼 걷어낸다
        const head = value.slice(lineStart, lineStart + INDENT.length);
        const strip = head.startsWith(INDENT) ? INDENT.length : head.startsWith(" ") ? 1 : 0;
        if (strip === 0) return;
        apply(
          value.slice(0, lineStart) + value.slice(lineStart + strip),
          Math.max(lineStart, start - strip),
        );
      } else {
        apply(value.slice(0, lineStart) + INDENT + value.slice(lineStart), start + INDENT.length);
      }
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || start !== end) return;

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const line = value.slice(lineStart, start);
    const match = LIST_LINE.exec(line);
    if (!match) return;

    const [, indent, marker, ordinal, body] = match;

    // 내용 없는 항목에서 Enter → 목록을 끝낸다 (그 줄을 지운다)
    if (body.trim() === "") {
      event.preventDefault();
      apply(value.slice(0, lineStart) + value.slice(start), lineStart);
      return;
    }

    // 번호 목록은 다음 번호로 이어간다
    const nextMarker = ordinal ? `${Number(ordinal) + 1}. ` : marker.replace(/\[[xX]\]/, "[ ]");
    const insert = `\n${indent}${nextMarker}`;

    event.preventDefault();
    apply(value.slice(0, start) + insert + value.slice(start), start + insert.length);
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      className={`${FIELD_INPUT} resize-y font-light`}
    />
  );
}
