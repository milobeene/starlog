"use client";

import { useRouter } from "next/navigation";
import MemoDialog from "@/components/detail/MemoDialog";
import StatsDialog from "@/components/detail/StatsDialog";
import OverridesDialog from "@/components/library/OverridesDialog";
import PlaythroughDialog from "@/components/library/PlaythroughDialog";
import AcquisitionDialog from "@/components/library/AcquisitionDialog";
import TagGenreDialog from "@/components/library/TagGenreDialog";
import CoverDialog from "@/components/library/CoverDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { DetailDialog } from "@/components/detail/detailDialog";
import { api } from "@/lib/api";
import { invalidateQueries } from "@/lib/useApi";
import type { BacklogDetail, OptionsResponse } from "@/lib/types";

/** 상세 화면이 여는 다이얼로그 전부 — 어느 것을 열지는 `dialog.kind`가 정한다 */
export default function DetailDialogs({
  dialog,
  data,
  options,
  onClose,
  onSaved,
}: {
  dialog: DetailDialog;
  data: BacklogDetail;
  options: OptionsResponse | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const { resolved, personalRecord } = data;

  return (
    <>
      {dialog?.kind === "memo" && (
        <MemoDialog
          entryId={data.entryId}
          record={personalRecord}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "stats" && (
        <StatsDialog
          entryId={data.entryId}
          record={personalRecord}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "overrides" && (
        <OverridesDialog detail={data} onClose={() => onClose()} onSaved={onSaved} />
      )}

      {dialog?.kind === "tag" && (
        <TagGenreDialog
          entryId={data.entryId}
          kind="tag"
          value={data.tag}
          dictionary={options?.tagDictionary ?? []}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "playthrough" && (
        <PlaythroughDialog
          entryId={data.entryId}
          run={dialog.run}
          options={options}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "acquisition" && (
        <AcquisitionDialog
          entryId={data.entryId}
          acquisition={dialog.item}
          options={options}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "cover" && (
        <CoverDialog
          entryId={data.entryId}
          cover={resolved.cover}
          onClose={() => onClose()}
          onSaved={onSaved}
        />
      )}

      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="항목 삭제"
          message={
            <>
              <b className="text-white">{resolved.name}</b>을(를) 라이브러리에서 삭제하시겠습니까?
              <br />
              같은 게임을 다시 담으시면 <b className="text-white">복구하실 수 있으며</b>, 기록도 함께 돌아옵니다.
            </>
          }
          onConfirm={async () => {
            await api.del(`/api/backlog/${data.entryId}`);
            /*
             * 사이드바는 (app)/library/layout.tsx에 있어 목록↔상세를 오갈 때
             * **언마운트되지 않는다.** 무효화가 없으면 방금 지운 게임이 왼쪽에 그대로 남아
             * 누르면 에러 상세로 들어간다
             */
            invalidateQueries();
            router.push("/library");
          }}
          onClose={() => onClose()}
        />
      )}
    </>
  );
}
