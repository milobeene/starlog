"use client";

/**
 * 테스트가 도는 동안의 입력값 — **섹션 단위로** 붙든다 (2026-08-28 재작성).
 *
 * ## 왜 섹션 단위인가
 *
 * 처음엔 폼 전체를 통째로 붙들었다. 그런데 이제 섹션마다 따로 테스트하므로,
 * 통째로 붙들면 **테스트하지도 않은 칸까지 되살아난다.** 사용자의 규칙은 분명하다:
 *
 * <pre>
 *   테스트 중인 섹션      → 다녀와도 값이 그대로 있어야 한다
 *   테스트 안 하는 섹션   → 다녀오면 원래 값으로 돌아가야 한다
 * </pre>
 *
 * 뒤엣것이 중요한 이유 — "잘못 건드렸으니 나갔다 오면 되겠지"가 자연스러운 기대인데,
 * 아무거나 붙들고 있으면 그 기대가 깨진다.
 *
 * ## 새로고침하면 사라진다
 *
 * 모듈 스코프라 문서가 다시 로드되면 통째로 없어진다 — 그게 맞는 동작이다.
 * 손으로 새로고침한 건 "처음부터"라는 뜻이다
 */
import type { ConnectionProfile } from "./desktop";

/** 따로 테스트·저장되는 묶음 */
export type SectionKey = "db" | "storage" | "igdb" | "translate";

type Draft = {
  /**
   * 붙들기 전의 이름.
   *
   * ⚠️ **이름 자체를 고치는 중일 수 있다.** 편집한 이름으로만 대조하면
   * "내 Neon"을 열어 "NeonDB"로 바꾸고 테스트한 경우, 돌아왔을 때
   * 저장된 이름과 안 맞아 **값이 통째로 날아간다**
   */
  originalName: string;
  /** 테스트를 시작한 화면. 알림의 [설정으로]가 여기로 돌려보낸다 */
  from: string;
  /** 섹션별로 붙들어둔 값. **여기 있는 것만** 되살아난다 */
  sections: Partial<Record<SectionKey, unknown>>;
  /** 이름 칸은 어느 섹션에도 안 붙는다 — 하나라도 붙들고 있으면 함께 살린다 */
  name?: string;
};

let draft: Draft | null = null;

/** 이 섹션의 값을 붙든다. 그 섹션의 테스트를 시작할 때 부른다 */
export function keepSection(
  key: SectionKey,
  value: unknown,
  profile: { name: string; originalName: string },
  from: string,
) {
  if (!draft || draft.originalName !== profile.originalName) {
    draft = { originalName: profile.originalName, from, sections: {} };
  }
  draft.from = from;
  draft.name = profile.name;
  draft.sections[key] = value;
}

/** 그 섹션은 이제 안 붙든다. 테스트가 끝나고 저장했거나 결과를 닫았을 때 */
export function releaseSection(key: SectionKey) {
  if (!draft) return;
  delete draft.sections[key];
  if (Object.keys(draft.sections).length === 0) draft = null;
}

/**
 * 되살릴 값. **붙들어둔 섹션만** 얹는다.
 *
 * 이름이 같은 것만 돌려준다 — 다른 연결을 열었는데 남의 값이 채워지면 안 된다
 */
export function restoreDraft(
  name: string,
  base: ConnectionProfile,
): ConnectionProfile {
  if (!draft) return base;
  if (draft.originalName !== name && draft.name !== name) return base;

  const next: ConnectionProfile = { ...base, ...(draft.name ? { name: draft.name } : {}) };
  for (const [key, value] of Object.entries(draft.sections)) {
    (next as unknown as Record<string, unknown>)[key] = value;
    /*
     * 스토리지에 무엇을 올릴지(`mediaTargets`)는 **스토리지 칸과 한 몸**이다.
     * 따로 두면 "칸은 되살아났는데 체크는 풀려 있는" 상태가 나온다
     */
  }
  return next;
}

export function draftOrigin(): string | null {
  return draft?.from ?? null;
}

/** 붙들고 있는 섹션이 있나 — 화면이 "다녀오셔도 됩니다"를 띄울지 정한다 */
export function heldSections(): SectionKey[] {
  return draft ? (Object.keys(draft.sections) as SectionKey[]) : [];
}

export function clearDraft() {
  draft = null;
}
