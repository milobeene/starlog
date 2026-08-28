"use client";

import EntryLoader from "@/components/ui/EntryLoader";
import { Button } from "@/components/ui/Field";
import { diagnosticOf, type LaunchProgress } from "@/lib/desktop";

/**
 * 기동 중 · 기동 실패.
 *
 * 스프링이 뜨는 데 3~5초, 클라우드면 콜드스타트까지 더 걸린다. **빈 화면으로 두면
 * 고장 난 줄 안다** — 입구의 세션 판정 대기에 쓰던 연출을 그대로 재사용한다.
 *
 * 실패는 예외가 아니라 **정상적인 갈래 하나**로 다룬다. 비번 오타는 늘 나는 일이고,
 * 그때 "무엇을 고쳐야 하는지"가 화면에 있어야 한다 (architecture §3)
 */
export default function LaunchOverlay({
  progress,
  onRetry,
  onRecover,
}: {
  progress: LaunchProgress;
  onRetry: () => void;
  /**
   * 손상됐을 때 백업 목록으로 보낸다.
   *
   * ⚠️ **안내만 띄우면 안 되는 유일한 실패다.** 다른 건 값을 고치거나 다시 누르면 되는데,
   * 손상은 되돌리는 것 말고 길이 없다. 실제로 이 안내가 없어서 성한 백업 12개를 두고도
   * "데이터가 날아갔다"고 여겼다
   */
  onRecover?: () => void;
}) {
  if (progress.phase === "error") {
    const { title, hint } = diagnosticOf(progress.code);
    const 손상 = progress.code === "DB_CORRUPTED";
    return (
      <div className="glass-panel w-full max-w-md rounded-xl !bg-neutral-950/92 px-6 py-7 text-center">
        <p className="text-sm font-medium text-red-300">{title}</p>
        <p className="mt-2 text-xs leading-relaxed text-white/45">{hint}</p>
        <div className="mt-6 flex justify-center gap-2">
          {손상 && onRecover && (
            <Button variant="primary" onClick={onRecover}>
              백업에서 되돌리기
            </Button>
          )}
          <Button onClick={onRetry}>돌아가기</Button>
        </div>
      </div>
    );
  }

  return (
    /*
      **문구가 하나여야 한다.** `EntryLoader`가 이미 제 문구를 그리는데 여기서 또 그려서
      "기록을 여는 중"이 두 줄로 겹쳐 보였다. 로더에 문구를 넘기는 쪽으로 합쳤다
    */
    <EntryLoader
      label={progress.phase === "starting" ? "앱 서버를 시작하는 중" : "기록을 여는 중"}
    />
  );
}
