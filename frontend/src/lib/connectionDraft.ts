"use client";

/**
 * 연결 테스트가 도는 동안의 입력값 (2026-08-28).
 *
 * ## 왜 따로 두나
 *
 * 테스트는 20초쯤 걸리고 **그동안 다른 화면에 갔다 올 수 있다.** 그런데 폼 상태가
 * 컴포넌트 안에만 있으면 돌아왔을 때 **방금 친 값이 사라진다** — 테스트는 통과했는데
 * 저장할 값이 없어지는 셈이다.
 *
 * ## 테스트를 시작해야만 보관한다
 *
 * 그냥 값만 만지다 나간 것은 **버리는 게 맞다.** "잘못 건드렸으니 나갔다 오면 되겠지"가
 * 자연스러운 기대인데, 아무거나 붙들고 있으면 그 기대가 깨진다.
 *
 * ## 새로고침하면 사라진다
 *
 * 모듈 스코프라 문서가 다시 로드되면 통째로 없어진다 — 그게 맞는 동작이다.
 * 손으로 새로고침한 건 "처음부터"라는 뜻이다
 */
import type { ConnectionProfile } from "./desktop";

type Draft = {
  profile: ConnectionProfile;
  /** 테스트를 시작한 화면. 알림의 "설정으로"가 여기로 돌려보낸다 */
  from: string;
};

let draft: Draft | null = null;

export function keepDraft(profile: ConnectionProfile, from: string) {
  draft = { profile, from };
}

/** 이름이 같은 것만 돌려준다 — 다른 연결을 열었는데 남의 값이 채워지면 안 된다 */
export function takeDraft(name: string): ConnectionProfile | null {
  return draft && draft.profile.name === name ? draft.profile : null;
}

export function draftOrigin(): string | null {
  return draft?.from ?? null;
}

export function clearDraft() {
  draft = null;
}
