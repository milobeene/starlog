"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";

export function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 text-xs text-white/30 transition-colors hover:text-white/70"
    >
      수정
    </button>
  );
}

/** 메모가 있는 선택지(기기·에뮬)의 행. 스펙을 접어두지 않고 그 자리에서 보여준다 */
export function CatalogRow({ memo, children }: { memo: string | null; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm">
      <div className="flex items-center gap-3">{children}</div>
      {memo && (
        <div className="markdown mt-2 border-t border-white/10 pt-2 text-xs leading-relaxed font-light text-white/55">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{memo}</ReactMarkdown>
        </div>
      )}
    </li>
  );
}

/**
 * 삭제 확인. 예전에는 누르는 즉시 지워져서 되돌릴 방법도 안내도 없었다.
 *
 * 선택지 다섯 종은 전부 **소프트 삭제**다 (§7.4) — 회차·취득이 참조하고 있어서
 * 행을 지우면 "무엇으로 플레이했는지"가 과거 기록에서 통째로 사라진다.
 * 그래서 문구도 하나로 모였다: 지난 기록에는 남고, 같은 이름으로 다시 추가하면 돌아온다
 */
export function DeleteButton({
  path,
  name,
  note,
  onDone,
}: {
  path: string;
  name: string;
  note?: string;
  onDone: () => void;
}) {
  const [asking, setAsking] = useState(false);

  return (
    <>
      <button
        onClick={() => setAsking(true)}
        className="shrink-0 text-xs text-white/30 transition-colors hover:text-red-400"
      >
        삭제
      </button>

      {asking && (
        <ConfirmDialog
          title={`${name} 삭제`}
          message={
            <>
              <b className="text-white">{name}</b>을(를) 목록에서 뺍니다. 과거 회차·취득 기록에는
              이름이 그대로 남습니다.
              {note && (
                <>
                  <br />
                  {note}
                </>
              )}
              <br />
              나중에 같은 이름으로 다시 추가하시면{" "}
              <b className="text-white">그대로 돌아옵니다.</b>
            </>
          }
          onConfirm={async () => {
            await api.del(path);
            onDone();
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </>
  );
}
