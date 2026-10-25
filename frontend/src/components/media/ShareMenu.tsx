"use client";

import Dropdown from "@/components/ui/Dropdown";
import { errorMessage } from "@/lib/api";
import { getBridge, type MediaTarget } from "@/lib/desktop";
import { putTask } from "@/lib/tasks";

/** 결과는 토스트로. 같은 `id`라 연달아 눌러도 하나만 남는다 */
function toast(title: string, ok: boolean, message?: string) {
  putTask({ id: "media-share", kind: "media-share", title, result: { ok, message } });
}

async function copy(targets: MediaTarget[]) {
  const media = getBridge()?.media;
  if (!media || targets.length === 0) return;
  try {
    const result = await media.copy(targets);
    if (result.ok) {
      // 하나일 때만 그림이 된다 — 여럿이면 클립보드가 그림을 한 장밖에 못 들어서 파일로 간다
      if (result.as === "image") toast("그림으로 복사했습니다", true);
      else if (result.count === 1) toast("파일을 복사했습니다", true, "이미지가 아니어서 파일로 복사됐습니다. 탐색기(Finder)에 붙여넣을 수 있습니다.");
      else toast(`파일 ${result.count}개를 복사했습니다`, true, "탐색기(Finder)·메신저에 붙여넣으면 파일로 들어갑니다.");
    } else if (result.reason === "NOT_FOUND") {
      toast("복사하지 못했습니다", false, `파일 ${result.failed.length}개를 찾을 수 없습니다. 폴더에서 지워졌는지 확인해 주세요.`);
    } else {
      toast("복사하지 못했습니다", false, "이 운영체제에서는 복사할 수 없습니다. 폴더에 저장을 이용해 주세요.");
    }
  } catch (caught) {
    toast("복사하지 못했습니다", false, errorMessage(caught, "잠시 후 다시 시도해 주세요."));
  }
}

async function save(targets: MediaTarget[]) {
  const media = getBridge()?.media;
  if (!media || targets.length === 0) return;
  try {
    const result = await media.saveTo(targets);
    if (result.canceled) return;
    const failed = result.failed.length;
    toast(
      failed === 0
        ? `${result.saved.length}개를 저장했습니다`
        : `${result.saved.length}개를 저장하고 ${failed}개는 저장하지 못했습니다`,
      failed === 0,
      result.folder,
    );
  } catch (caught) {
    toast("저장하지 못했습니다", false, errorMessage(caught, "잠시 후 다시 시도해 주세요."));
  }
}

/**
 * 고른 스크린샷을 밖으로 보낸다 — 클립보드 복사 · 폴더에 저장.
 * 전체 화면 갤러리와 상세의 스크린샷 구역이 같이 쓴다. 일렉트론에서만 뜻이 있다
 * (브라우저는 로컬 파일 접근과 폴더 선택이 없다)
 */
export default function ShareMenu({ targets }: { targets: MediaTarget[] }) {
  if (!getBridge()?.media) return null;
  const none = targets.length === 0;
  return (
    <Dropdown
      align="right"
      panelClassName="w-64"
      disabled={none}
      trigger={() => (
        <span
          className={`block rounded-md border border-white/15 px-3 py-2 text-xs font-medium tracking-widest whitespace-nowrap text-white/80 uppercase transition-all sm:px-4 ${
            none ? "opacity-40" : "hover:bg-white/10 hover:text-white"
          }`}
        >
          공유
        </span>
      )}
    >
      {(close) => (
        <>
          <button
            className="menu-item flex-col !items-start !gap-0"
            onClick={() => {
              close();
              void copy(targets);
            }}
          >
            클립보드 복사
            <span className="text-[11px] text-white/35">
              {targets.length > 1 ? `파일 ${targets.length}개로 복사합니다` : "사진은 그림으로, 그 밖에는 파일로"}
            </span>
          </button>
          <button
            className="menu-item"
            onClick={() => {
              close();
              void save(targets);
            }}
          >
            폴더에 저장…
          </button>
        </>
      )}
    </Dropdown>
  );
}
