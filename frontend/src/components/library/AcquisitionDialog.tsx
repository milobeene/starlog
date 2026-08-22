"use client";

import type { Acquisition } from "@/lib/types";
import Button from "@/components/common/Button";
import Dialog from "@/components/common/Dialog";
import { MOCK_OPTIONS } from "@/lib/mock";
import { ACQUISITION_METHOD_LABEL } from "@/lib/labels";
import form from "@/components/common/form.module.css";

type Props = {
  open: boolean;
  target: Acquisition | null;
  onClose: () => void;
  onDelete: () => void;
};

/** POST /api/backlog/{id}/acquisitions · PUT/DELETE /api/acquisitions/{id} */
export default function AcquisitionDialog({ open, target, onClose, onDelete }: Props) {
  return (
    <Dialog
      open={open}
      title={target ? "취득 기록 수정" : "취득 기록 추가"}
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
            <span className={form.label}>취득 방식</span>
            <select className={form.select} defaultValue={target?.method ?? "PURCHASED"}>
              {Object.entries(ACQUISITION_METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={form.field}>
            <span className={form.label}>취득일</span>
            <input type="date" className={form.input} defaultValue={target?.acquiredOn ?? ""} />
          </label>
        </div>

        <div className={form.grid2}>
          <label className={form.field}>
            <span className={form.label}>플랫폼</span>
            <select className={form.select} defaultValue={target?.platform?.id ?? ""}>
              <option value="">실물 · 해당 없음</option>
              {MOCK_OPTIONS.platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </label>
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
        </div>

        <label className={form.field}>
          <span className={form.label}>구독</span>
          <select
            className={form.select}
            defaultValue={target?.subscription?.subscriptionId ?? ""}
          >
            <option value="">연결 안 함</option>
            {MOCK_OPTIONS.subscriptions.map((subscription) => (
              <option key={subscription.subscriptionId} value={subscription.subscriptionId}>
                {subscription.serviceName}
              </option>
            ))}
          </select>
          <span className={form.hint}>취득 방식이 &quot;구독&quot;일 때만 연결합니다</span>
        </label>

        <div className={form.grid3}>
          <label className={form.field}>
            <span className={form.label}>금액</span>
            <input
              type="number"
              className={form.input}
              defaultValue={target?.price?.amount ?? ""}
            />
          </label>
          <label className={form.field}>
            <span className={form.label}>통화</span>
            <select className={form.select} defaultValue={target?.price?.currency ?? "KRW"}>
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
              <option value="JPY">JPY</option>
            </select>
          </label>
          <label className={form.field}>
            <span className={form.label}>라벨</span>
            <input
              className={form.input}
              defaultValue={target?.label ?? ""}
              placeholder="재구매 · DLC 등"
            />
          </label>
        </div>
      </div>
    </Dialog>
  );
}
