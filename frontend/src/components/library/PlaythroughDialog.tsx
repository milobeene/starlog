"use client";

import type { Playthrough } from "@/lib/types";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { MOCK_OPTIONS } from "@/lib/mock";
import { INPUT_METHOD_LABEL, PLAYTHROUGH_STATUS_LABEL } from "@/lib/labels";
import form from "@/components/common/form.module.css";

type Props = {
  open: boolean;
  /** null이면 추가 */
  target: Playthrough | null;
  onClose: () => void;
  onDelete: () => void;
};

/**
 * POST /api/backlog/{id}/playthroughs · PUT/DELETE /api/playthroughs/{id}
 * 검증 규칙(BR-PT-01~06)은 서버가 최종 판단한다. 폼은 최선 노력일 뿐이다.
 */
export default function PlaythroughDialog({ open, target, onClose, onDelete }: Props) {
  return (
    <Dialog
      open={open}
      title={target ? `${target.sequenceNo}회차 수정` : "회차 추가"}
      onClose={onClose}
      footer={
        <>
          {target && (
            <Button variant="danger" onClick={onDelete} className={form.pushLeft}>
              삭제
            </Button>
          )}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={onClose}>
            저장
          </Button>
        </>
      }
    >
      <div className={form.stack}>
        <div className={form.grid2}>
          <label className={form.field}>
            <span className={form.label}>시작일</span>
            <input type="date" className={form.input} defaultValue={target?.startedOn ?? ""} />
          </label>
          <label className={form.field}>
            <span className={form.label}>종료일</span>
            <input
              type="date"
              className={form.input}
              defaultValue={target?.finishedOn ?? ""}
            />
            <span className={form.hint}>비우면 진행 중</span>
          </label>
        </div>

        <div className={form.grid2}>
          <label className={form.field}>
            <span className={form.label}>상태</span>
            <select className={form.select} defaultValue={target?.status ?? "PLAYING"}>
              {Object.entries(PLAYTHROUGH_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={form.field}>
            <span className={form.label}>입력 방식</span>
            <select className={form.select} defaultValue={target?.inputMethod ?? ""}>
              <option value="">선택 안 함</option>
              {Object.entries(INPUT_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={form.grid2}>
          <label className={form.field}>
            <span className={form.label}>기기</span>
            <select className={form.select} defaultValue={target?.device?.id ?? ""}>
              <option value="">선택 안 함</option>
              {MOCK_OPTIONS.devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
            <span className={form.hint}>보유 기기가 아니어도 고를 수 있습니다</span>
          </label>
          <label className={form.field}>
            <span className={form.label}>에뮬레이터</span>
            <select className={form.select} defaultValue={target?.emulator?.id ?? ""}>
              <option value="">사용 안 함</option>
              {MOCK_OPTIONS.emulators.map((emulator) => (
                <option key={emulator.id} value={emulator.id}>
                  {emulator.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={form.grid2}>
          <label className={form.field}>
            <span className={form.label}>플랫폼 계정</span>
            <select
              className={form.select}
              defaultValue={target?.platformAccount?.accountId ?? ""}
            >
              <option value="">선택 안 함</option>
              {MOCK_OPTIONS.platformAccounts.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.platform.name} · {account.label}
                </option>
              ))}
            </select>
          </label>
          <label className={form.field}>
            <span className={form.label}>라벨</span>
            <input
              className={form.input}
              defaultValue={target?.label ?? ""}
              placeholder="DLC · 마스터 모드 등"
            />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
