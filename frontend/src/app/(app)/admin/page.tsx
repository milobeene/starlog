"use client";

import DateField from "@/components/ui/DateField";
import { useState } from "react";
import PageHeading from "@/components/ui/PageHeading";
import ErrorNotice from "@/components/ui/ErrorNotice";
import Pagination from "@/components/ui/Pagination";
import DataTable from "@/components/library/DataTable";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import AdminGameMaster from "@/components/admin/AdminGameMaster";
import AdminSystemTab from "@/components/admin/AdminSystemTab";
import { useApi } from "@/lib/useApi";
import { api, qs } from "@/lib/api";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import type { AdminMember, AuditLog, PageResponse } from "@/lib/types";

const TABS = [
  { key: "members", label: "회원" },
  { key: "games", label: "게임 마스터" },
  { key: "logs", label: "감사 로그" },
  /* WEB-ONLY: 로컬 앱에는 남의 사용량을 볼 일이 없다 (docs/web-only-inventory.md) */
  { key: "system", label: "시스템" },
] as const;

type Tab = (typeof TABS)[number]["key"];

/** 세 탭이 같은 페이지 크기를 쓴다 */
const PAGE_SIZE = 30;

/**
 * 관리자 화면.
 *
 * 회원 제재(정지·강제 탈퇴)는 스펙 범위 밖이라 없다. 대신 **가입 승인**이 있다 (FR-ADM-06) —
 * 무료 티어로 배포하므로 아무나 들어오면 용량이 먼저 터진다.
 *
 * 화면 문구는 다른 화면과 같은 **존댓말 서비스 톤**이다 (design-system §6.5).
 * 관리자만 본다고 말을 놓으면 한 서비스 안에서 말투가 두 개가 된다.
 *
 * **화면을 숨기는 건 보안이 아니다.** 실제 방어선은 서버의 403이라
 * 여기서 role을 보고 가리지 않고, 권한이 없으면 ErrorNotice가 뜬다
 */
export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("members");

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-8 pt-24 pb-20">
        <PageHeading
          eyebrow="Admin"
          title="관리자"
          subtitle="가입 승인과 게임 마스터를 관리하실 수 있습니다."
        />

        <div className="mt-8 mb-6 flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              aria-pressed={tab === item.key}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === item.key ? "bg-white text-black" : "text-white/50 hover:text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/*
          탭마다 페이지 상태가 따로 놀아야 해서 컴포넌트를 나눴다.
          한 컴포넌트에서 page를 공유하면 탭을 옮길 때 3페이지에서 시작하는 일이 생긴다
        */}
        {tab === "members" && <MembersTab />}
        {tab === "games" && <AdminGameMaster />}
        {tab === "logs" && <LogsTab />}
        {tab === "system" && <AdminSystemTab />}
      </div>
    </main>
  );
}

/**
 * 회원 목록·검색 + 가입 승인 (FR-ADM-03, FR-ADM-06).
 *
 * 검색은 **적용 버튼으로 확정한다** — 날짜 칸은 타이핑 도중에도 onChange가 계속 터져서
 * 디바운스를 걸어도 반쯤 입력된 날짜로 조회가 나간다
 */
function MembersTab() {
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState({ email: "", joinedFrom: "", joinedTo: "" });
  const [query, setQuery] = useState(draft);
  const [approving, setApproving] = useState<AdminMember | null>(null);

  const data = useApi<PageResponse<AdminMember>>(
    `/api/admin/members${qs({ ...query, page, size: PAGE_SIZE })}`,
  );

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setQuery(draft);
  };

  const reset = () => {
    const empty = { email: "", joinedFrom: "", joinedTo: "" };
    setDraft(empty);
    setQuery(empty);
    setPage(0);
  };

  const filtered = query.email || query.joinedFrom || query.joinedTo;

  return (
    <>
      <form
        onSubmit={apply}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[10px] tracking-widest text-white/35 uppercase">Email</span>
          <input
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            placeholder="이메일 일부를 입력해 주세요"
            className={FIELD_INPUT}
          />
        </label>
        {/* label이 아니라 div다 — 안이 button이라 label이면 클릭이 두 번 먹는다 */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-widest text-white/35 uppercase">가입일 From</span>
          <DateField
            value={draft.joinedFrom}
            onChange={(value) => setDraft({ ...draft, joinedFrom: value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] tracking-widest text-white/35 uppercase">가입일 To</span>
          <DateField
            value={draft.joinedTo}
            onChange={(value) => setDraft({ ...draft, joinedTo: value })}
          />
        </div>
        <Button type="submit" variant="primary">
          검색
        </Button>
        {filtered && <Button onClick={reset}>초기화</Button>}
      </form>

      {data.error ? (
        <ErrorNotice error={data.error} onRetry={data.reload} />
      ) : data.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <MembersTable data={data} onApprove={setApproving} page={page} onPage={setPage} />
      )}

      {approving && (
        <ConfirmDialog
          title="가입 승인"
          confirmLabel="승인"
          message={
            <>
              <b className="text-white">{approving.email}</b>의 가입을 승인합니다. 승인하시면 이
              계정으로 바로 로그인하실 수 있게 됩니다.
            </>
          }
          onConfirm={async () => {
            await api.post(`/api/admin/members/${approving.memberId}/approve`);
            data.reload();
          }}
          onClose={() => setApproving(null)}
        />
      )}
    </>
  );
}

function MembersTable({
  data,
  onApprove,
  page,
  onPage,
}: {
  data: ReturnType<typeof useApi<PageResponse<AdminMember>>>;
  onApprove: (member: AdminMember) => void;
  page: number;
  onPage: (page: number) => void;
}) {
  const pending = (data.data?.items ?? []).filter((member) => !member.approvedAt).length;

  return (
    <>
      {pending > 0 && (
        <div className="mb-4 rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
          승인을 기다리는 계정이 <b className="text-amber-100">{pending}건</b> 있습니다. 승인 전까지
          그 계정은 로그인할 수 없습니다.
        </div>
      )}

      <DataTable headers={["ID", "이메일", "닉네임", "권한", "인증", "가입일", "상태", ""]}>
        {data.data?.items.map((member) => (
          <tr key={member.memberId} className="hover:bg-white/[0.03]">
            <td className="num px-4 py-3 text-white/50">{member.memberId}</td>
            <td className="px-4 py-3 text-white/90">{member.email}</td>
            <td className="px-4 py-3 text-white/70">{member.nickname}</td>
            <td className="px-4 py-3 text-white/50">{member.role}</td>
            <td className="px-4 py-3">
              {member.emailVerified ? (
                <span className="text-green-400">완료</span>
              ) : (
                <span className="text-yellow-400">미인증</span>
              )}
            </td>
            <td className="num px-4 py-3 text-white/50">{member.createdAt.slice(0, 10)}</td>
            <td className="px-4 py-3">
              {member.deletedAt ? (
                <span className="text-red-400">탈퇴 유예</span>
              ) : member.approvedAt ? (
                <span className="text-white/40">정상</span>
              ) : (
                <span className="text-amber-400">승인 대기</span>
              )}
            </td>
            <td className="px-4 py-3 text-right">
              {!member.approvedAt && !member.deletedAt && (
                <button
                  onClick={() => onApprove(member)}
                  className="text-xs text-emerald-300 transition-colors hover:text-emerald-200"
                >
                  승인
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>

      {data.data && (
        <Pagination page={page} totalPages={data.data.totalPages} onChange={onPage} />
      )}
    </>
  );
}

/** 감사 로그 (FR-ADM-05). 이 조회 자체도 로그에 남는다 */
function LogsTab() {
  const [page, setPage] = useState(0);
  const data = useApi<PageResponse<AuditLog>>(
    `/api/admin/audit-logs?page=${page}&size=${PAGE_SIZE}`,
  );

  if (data.error) return <ErrorNotice error={data.error} onRetry={data.reload} />;
  if (data.loading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <DataTable headers={["시각", "행위자", "행위", "대상", "IP"]}>
        {data.data?.items.map((log) => (
          <tr key={log.auditLogId} className="hover:bg-white/[0.03]">
            <td className="num px-4 py-3 text-white/50">
              {log.occurredAt.slice(0, 19).replace("T", " ")}
            </td>
            <td className="px-4 py-3 text-white/70">{log.actorEmail}</td>
            <td className="px-4 py-3 text-white/90">{log.action}</td>
            <td className="px-4 py-3 text-white/50">
              {log.targetType ? `${log.targetType} #${log.targetId ?? "—"}` : "—"}
            </td>
            <td className="num px-4 py-3 text-white/40">{log.requestIp ?? "—"}</td>
          </tr>
        ))}
      </DataTable>

      {data.data && (
        <Pagination page={page} totalPages={data.data.totalPages} onChange={setPage} />
      )}
    </>
  );
}
