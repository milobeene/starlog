"use client";

import Markdown from "@/components/ui/Markdown";
import SettingsSection from "@/components/settings/SettingsSection";
import type { SettingsDialog } from "@/components/settings/settingsDialog";
import { Button } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MeResponse } from "@/lib/types";

interface Props {
  loading: boolean;
  data: MeResponse | null;
  onOpen: (dialog: SettingsDialog) => void;
}

export function ProfileSection({ loading, data, onOpen }: Props) {
  return (
    <SettingsSection
      title="프로필"
      icon="profile"
      action={<Button onClick={() => onOpen({ kind: "profile" })}>수정</Button>}
    >
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          {/*
            이메일을 안 보여준다 (2026-08-28). 로그인이 없어진 v1.0에서 이 값은
            `owner@starlog.local` — **주인 계정을 만들 때 채워 넣은 자리표시자**다.
            아무 뜻도 없는 문자열을 프로필에 띄우면 "이게 뭐지"만 남는다
          */}
          <div className="text-sm font-medium">{data?.profile.nickname}</div>
        </div>
      )}
    </SettingsSection>
  );
}

/**
 * 메모는 자유 서식이라 프로필 폼 한 줄로는 좁다.
 * 게임 메모와 같은 마크다운 렌더를 써서 보는 것과 쓰는 것을 가른다
 */
export function MemoSection({ loading, data, onOpen }: Props) {
  return (
    <SettingsSection
      collapsible
      title="메모"
      icon="note"
      description="게이밍 기어 스펙, 모딩 설정, 세팅값처럼 어디에도 안 들어가는 것들을 적어 두세요. 마크다운을 지원합니다."
      action={<Button onClick={() => onOpen({ kind: "memo" })}>수정</Button>}
    >
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : data?.profile.memo ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-5 py-4">
          <div className="markdown text-sm leading-relaxed font-light text-white/80">
            <Markdown>{data.profile.memo}</Markdown>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-xs text-white/30">
          작성된 메모가 없습니다
        </div>
      )}
    </SettingsSection>
  );
}
