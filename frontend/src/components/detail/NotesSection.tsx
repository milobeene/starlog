"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Collapsible } from "@/components/settings/SettingsSection";
import SectionIcon from "@/components/ui/SectionIcon";
import { Button } from "@/components/ui/Field";
import type { DetailDialog } from "@/components/detail/detailDialog";
import type { BacklogDetail } from "@/lib/types";

/** 내 기록은 제일 아래 — 읽는 순서상 게임 정보를 다 본 뒤에 온다 */
export default function NotesSection({
  memo,
  onOpen,
}: {
  memo: BacklogDetail["personalRecord"]["memo"];
  onOpen: (dialog: DetailDialog) => void;
}) {
  return (
    <section>
      <h3 className="mb-4 flex items-center justify-between gap-3 text-base font-medium text-white/90 sm:text-lg">
        <span className="flex items-center gap-2">
          <SectionIcon name="note" />
          My Notes
        </span>
        {/*
          이 버튼만 오버라이드 색을 쓴다 (사용자 결정 2026-08-28) — 아래 내용이
          IGDB가 아니라 **내가 쓴 것**이라는 표시다. 호버 연출은 그대로 둔다
        */}
        <Button
          className="!text-teal-200/70"
          onClick={() => onOpen({ kind: "memo" })}
        >
          메모 수정
        </Button>
      </h3>
      {/*
        노트도 접는다 (v1.2). 총평이 길면 스크린샷과 그 아래가 통째로 밀린다 —
        프로필의 목록들과 **같은 높이**라 화면 사이에서 눈이 안 흔들린다
      */}
      {memo ? (
        <Collapsible>
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          {/*
            메모는 마크다운 원문이다 (`# 📝 총평` 헤더 + 중첩 불릿).
            스타일을 요소별로 직접 주는 이유 — 리셋이 h/ul 기본값을 다 지웠다
          */}
          <div className="markdown text-sm leading-relaxed font-light text-white/80">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{memo}</ReactMarkdown>
          </div>
        </div>
        </Collapsible>
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/30">
          작성된 메모가 없습니다.
        </div>
      )}
    </section>
  );
}
