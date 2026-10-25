"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import { errorMessage } from "@/lib/api";

const PHRASE = "연결 해제";
const STEPS = 5;
const COUNTDOWN_S = 3;

/**
 * [외부 캘린더 연결 해제] 확인 — **다섯 번** 묻는다 (사용자 결정 2026-10-25).
 * 한 번 풀면 외부 캘린더가 이 일정들을 다시는 못 고친다. 건너뛰기 없이 한 단계씩,
 * 어느 단계에서든 [취소]·Esc·바깥 누르기로 빠져나간다. 마지막 단추는 3초 뒤에야 켜진다
 */
export default function DetachAllDialog({
  counts,
  onConfirm,
  onClose,
}: {
  counts: { total: number; ended: number; future: number };
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(COUNTDOWN_S);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 마지막 단계에 들어온 순간부터 센다 — 앞 단계에서 미리 흘러가면 기다림이 무의미하다
  useEffect(() => {
    if (step !== STEPS) return;
    queueMicrotask(() => setLeft(COUNTDOWN_S));
    const timer = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const phraseOk = typed === PHRASE;
  const canNext = step === 4 ? phraseOk : true;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught, "연결을 해제하지 못했습니다. 잠시 후 다시 시도해 주세요."));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="외부 캘린더 연결 해제"
      width="max-w-md"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <span className="num mr-auto text-xs text-white/35">
            {step}/{STEPS}
          </span>
          {error && <span className="text-xs text-red-400">{error}</span>}
          <Button onClick={onClose} disabled={busy}>
            취소
          </Button>
          {step < STEPS ? (
            <Button variant="danger" disabled={!canNext} onClick={() => setStep(step + 1)}>
              다음
            </Button>
          ) : (
            <Button variant="danger" disabled={busy || left > 0} onClick={run}>
              {busy ? "처리 중" : left > 0 ? `연결 해제 (${left})` : "연결 해제"}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-white/70">
        {step === 1 && (
          <>
            <p>아직 연결된 외부 일정을 전부 &lsquo;연결 끊긴 외부 일정&rsquo; 목록으로 옮깁니다.</p>
            <p className="num rounded-md border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              총 {counts.total}개 · 끝난 {counts.ended}개 · 예정 {counts.future}개
            </p>
          </>
        )}
        {step === 2 && (
          <p>
            연결을 해제하면 <strong className="text-white/90">외부 캘린더는 이 일정들을 더 이상 고칠 수 없습니다.</strong> 외부
            캘린더에서 고치거나 지워도 STARLOG에는 반영되지 않습니다.
          </p>
        )}
        {step === 3 && (
          <p>
            예정 일정 <span className="num">{counts.future}</span>개는 시각이 지나면 플레이타임 합계에 들어갑니다. 실제로
            하지 않을 일정이라면 연결 해제 뒤 정리 목록에서 지워 주세요.
          </p>
        )}
        {step === 4 && (
          <>
            <p>
              계속하시려면 <strong className="text-white/90">{PHRASE}</strong>를 그대로 입력해 주세요.
            </p>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.key !== "Enter") return;
                if (phraseOk) setStep(5);
              }}
              placeholder={PHRASE}
              className={FIELD_INPUT}
              aria-label="확인 문구"
            />
          </>
        )}
        {step === 5 && (
          <p>
            마지막 확인입니다. 외부 일정 <span className="num">{counts.total}</span>개의 연결을 해제합니다. 되돌릴 수
            없습니다.
          </p>
        )}
      </div>
    </Modal>
  );
}
