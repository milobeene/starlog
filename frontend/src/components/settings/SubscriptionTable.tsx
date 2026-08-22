"use client";

import { useState } from "react";
import type { Subscription } from "@/lib/types";
import Button from "@/components/common/Button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import Dialog from "@/components/common/Dialog";
import SettingsSection from "./SettingsSection";
import { BILLING_CYCLE_LABEL, formatMoney, formatPeriod } from "@/lib/labels";
import form from "@/components/common/form.module.css";
import styles from "./Settings.module.css";

type Props = {
  subscriptions: Subscription[];
};

/** 서비스명은 자유 문자열(OI-06). 종료일 null = 구독 중 */
export default function SubscriptionTable({ subscriptions }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState<Subscription | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null);

  return (
    <SettingsSection
      title="구독"
      action={
        <Button
          size="sm"
          onClick={() => {
            setTarget(null);
            setDialogOpen(true);
          }}
        >
          ＋ 추가
        </Button>
      }
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">서비스</th>
              <th scope="col">기간</th>
              <th scope="col">요금</th>
              <th scope="col">결제 주기</th>
              <th scope="col">상태</th>
              <th scope="col" className={styles.right}>
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr key={subscription.subscriptionId}>
                <td>{subscription.serviceName}</td>
                <td>{formatPeriod(subscription.startedOn, subscription.endedOn)}</td>
                <td>{formatMoney(subscription.fee)}</td>
                <td>{BILLING_CYCLE_LABEL[subscription.billingCycle]}</td>
                <td className={subscription.active ? undefined : styles.muted}>
                  {subscription.active ? "구독 중" : "종료"}
                </td>
                <td className={styles.right}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setTarget(subscription);
                      setDialogOpen(true);
                    }}
                  >
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(subscription)}
                  >
                    삭제
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogOpen}
        title={target ? "구독 수정" : "구독 추가"}
        onClose={() => setDialogOpen(false)}
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              저장
            </Button>
          </>
        }
      >
        <div className={form.stack}>
          <label className={form.field}>
            <span className={form.label}>서비스명</span>
            <input className={form.input} defaultValue={target?.serviceName ?? ""} />
          </label>

          <div className={form.grid2}>
            <label className={form.field}>
              <span className={form.label}>시작일</span>
              <input type="date" className={form.input} defaultValue={target?.startedOn ?? ""} />
            </label>
            <label className={form.field}>
              <span className={form.label}>종료일</span>
              <input type="date" className={form.input} defaultValue={target?.endedOn ?? ""} />
              <span className={form.hint}>비우면 구독 중</span>
            </label>
          </div>

          <div className={form.grid3}>
            <label className={form.field}>
              <span className={form.label}>요금</span>
              <input
                type="number"
                className={form.input}
                defaultValue={target?.fee.amount ?? ""}
              />
            </label>
            <label className={form.field}>
              <span className={form.label}>통화</span>
              <select className={form.select} defaultValue={target?.fee.currency ?? "KRW"}>
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
              </select>
            </label>
            <label className={form.field}>
              <span className={form.label}>결제 주기</span>
              <select className={form.select} defaultValue={target?.billingCycle ?? "MONTHLY"}>
                {Object.entries(BILLING_CYCLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="구독을 삭제할까요?"
        description={`"${deleteTarget?.serviceName ?? ""}" — 이 구독으로 얻은 취득 기록의 연결이 끊깁니다.`}
        onClose={() => setDeleteTarget(null)}
      />
    </SettingsSection>
  );
}
