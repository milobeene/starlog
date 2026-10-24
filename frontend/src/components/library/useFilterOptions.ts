import { useMemo } from "react";
import { accountLabel, ACQUISITION_METHOD_LABEL } from "@/lib/labels";
import type { ComboOption } from "@/components/ui/Combobox";
import type { Filters } from "@/components/library/filters";
import type { FacetsResponse, GenreDistribution, OptionsResponse } from "@/lib/types";

/**
 * 필터 칸마다 들어갈 선택지. 어느 목록이 좁혀지는지는 `draft`가 정한다
 * (플랫폼을 고르면 그 플랫폼의 계정만 남는 식)
 */
export function useFilterOptions({
  facets,
  genres,
  options,
  developers,
  draft,
}: {
  facets: FacetsResponse | null;
  genres: GenreDistribution[] | null;
  options: OptionsResponse | null;
  developers: string[] | null;
  draft: Filters;
}) {
  // 자동완성은 **사전에 있는 것만** 보여준다. 사전에 없는 값도 직접 쳐서 거를 수 있다 —
  // 서버는 마스터 값까지 뒤지므로 IGDB가 준 이름으로도 검색된다
  const developerOptions = useMemo<ComboOption[]>(
    () => (developers ?? []).map((name) => ({ value: name, label: name })),
    [developers],
  );
  const genreOptions = useMemo<ComboOption[]>(
    () => (genres ?? []).map((item) => ({ value: item.genre, label: item.genre, count: item.count })),
    [genres],
  );
  const deviceOptions = useMemo<ComboOption[]>(
    () => (facets?.devices ?? []).map((item) => ({ value: String(item.id), label: item.name, count: item.count })),
    [facets],
  );
  const platformOptions = useMemo<ComboOption[]>(
    () => (options?.platforms ?? []).map((item) => ({ value: String(item.id), label: item.name })),
    [options],
  );
  /*
   * 계정은 facets를 쓴다 — 카운트가 붙고, 실제로 취득에 쓰인 계정만 나온다.
   * options 쪽은 아직 아무 데도 안 쓴 계정까지 줘서 필터로는 과하다
   */
  const acqAccountOptions = useMemo<ComboOption[]>(
    () => {
      const picked = draft.acqPlatformId ? Number(draft.acqPlatformId) : null;
      return (options?.platformAccounts ?? [])
        .filter((a) => picked == null || a.platformId === picked)
        .map((a) => ({
          value: String(a.id),
          label: accountLabel(a.platformName ?? a.emulatorName, a.name),
        }));
    },
    [options, draft.acqPlatformId],
  );

  const emulatorOptions = useMemo<ComboOption[]>(
    () => (options?.emulators ?? []).map((item) => ({ value: String(item.id), label: item.name })),
    [options],
  );

  /**
   * 회차의 계정 — 소속을 고르면 그 소속의 것만, 안 고르면 **그 종류 전체**.
   * (플랫폼 모드면 플랫폼 계정, 에뮬 모드면 에뮬 계정. 취득 축과 같은 규칙이다)
   */
  const ptAccountOptions = useMemo<ComboOption[]>(
    () => {
      const owner = Number(draft.ptRunsOn === "platform" ? draft.ptPlatformId : draft.ptEmulatorId);
      const picked = Number.isFinite(owner) && owner > 0 ? owner : null;
      return (options?.platformAccounts ?? [])
        .filter((a) => {
          const ownerId = draft.ptRunsOn === "platform" ? a.platformId : a.emulatorId;
          return ownerId != null && (picked == null || ownerId === picked);
        })
        .map((a) => ({
          value: String(a.id),
          label: accountLabel(a.platformName ?? a.emulatorName, a.name),
        }));
    },
    [options, draft.ptRunsOn, draft.ptPlatformId, draft.ptEmulatorId],
  );

  const methodOptions = useMemo<ComboOption[]>(
    () =>
      Object.entries(ACQUISITION_METHOD_LABEL).map(([value, label]) => ({
        value,
        label: String(label),
      })),
    [],
  );

  return {
    developerOptions,
    genreOptions,
    deviceOptions,
    platformOptions,
    emulatorOptions,
    acqAccountOptions,
    ptAccountOptions,
    methodOptions,
  };
}
