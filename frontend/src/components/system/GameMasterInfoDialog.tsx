"use client";

import DateField from "@/components/ui/DateField";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Button, Field, FIELD_INPUT } from "@/components/ui/Field";
import { api, errorMessage } from "@/lib/api";
import type { GameRow } from "@/components/system/gameMaster";
import type { MasterInfo } from "@/lib/types";

/** 마스터 정보 수정 (FR-ADM-01). **전체 교체** — 비운 칸은 지워진다 */
export default function InfoDialog({
  game,
  onClose,
  onDone,
}: {
  game: GameRow;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
}) {
  const [developers, setDevelopers] = useState("");
  const [publishers, setPublishers] = useState("");
  const [genres, setGenres] = useState("");
  /*
   * 현재 값 미리 채우기. 목록 행에는 이 셋이 없어서 열 때 한 번 받아온다.
   * ⚠️ **받기 전에 저장하면 전체 교체라 셋이 비워진다** — 받는 동안 칸을 잠그고 저장을 막는다.
   * 받기 실패(서버가 `GET /api/games/{id}`를 안 주는 등)면 예전처럼 빈 칸 + 경고로 둔다
   */
  const [prefill, setPrefill] = useState<"loading" | "done" | "failed">("loading");
  useEffect(() => {
    let alive = true;
    api
      .get<Pick<MasterInfo, "developers" | "publishers" | "genres">>(`/api/games/${game.gameId}`)
      .then((info) => {
        if (!alive) return;
        setDevelopers(info.developers.join(", "));
        setPublishers(info.publishers.join(", "));
        setGenres(info.genres.join(", "));
        setPrefill("done");
      })
      .catch(() => alive && setPrefill("failed"));
    return () => {
      alive = false;
    };
  }, [game.gameId]);
  const [releasedOn, setReleasedOn] = useState(game.releasedOn ?? "");
  /*
   * 이름을 여기로 합쳤다 (2026-08-29). 버튼이 둘이면 "이름을 고치려면 어느 쪽이지"가 생긴다.
   *
   * ⚠️ **엔드포인트는 여전히 둘이다.** 이름은 담긴 항목의 displayName까지 전파해서
   * 파급이 다르다 — 합친 것은 화면이지 API가 아니다. 바뀐 것만 부른다
   */
  const [name, setName] = useState(game.name);

  const toList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return (
    <AdminFormDialog
      title="마스터 정보 수정"
      onClose={onClose}
      blocked={prefill === "loading"}
      onSubmit={async () => {
        let propagated = 0;
        // 이름을 먼저 — 실패하면 정보까지 바꾸지 않는다. 반쯤 반영된 상태가 제일 나쁘다
        if (name.trim() !== game.name) {
          const renamed = await api.put<{ updatedEntries: number }>(
            `/api/games/${game.gameId}/name`,
            { name: name.trim() },
          );
          propagated += renamed.updatedEntries;
        }
        const result = await api.put<{ updatedEntries: number }>(
          `/api/games/${game.gameId}`,
          {
            developers: toList(developers),
            publishers: toList(publishers),
            genres: toList(genres),
            releasedOn: releasedOn || null,
            listPrice: null,
          },
        );
        propagated += result.updatedEntries;
        await onDone(`${propagated}건의 항목에 전파했습니다.`);
      }}
    >
      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={300}
          className={FIELD_INPUT}
        />
      </Field>
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        이름을 직접 덮어쓴 회원의 항목은 <b className="text-white/75">바뀌지 않습니다.</b> 개인
        오버라이드가 마스터보다 우선합니다.
      </p>

      {prefill === "failed" ? (
        <p className="rounded-md border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/80">
          <b className="text-amber-100">현재 값을 불러오지 못했습니다.</b> 아래 셋은 전체 교체라
          비워 두신 칸은 마스터에서 지워집니다. 유지하시려면 그대로 다시 입력해 주세요.
        </p>
      ) : (
        <p className="text-[11px] leading-relaxed text-white/40">
          아래 셋은 전체 교체입니다 — 비우면 마스터에서 지워집니다.
        </p>
      )}
      <Field label="Developers" hint="쉼표로 구분">
        <input
          value={developers}
          onChange={(event) => setDevelopers(event.target.value)}
          disabled={prefill === "loading"}
          placeholder={prefill === "loading" ? "불러오는 중…" : undefined}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Publishers" hint="쉼표로 구분">
        <input
          value={publishers}
          onChange={(event) => setPublishers(event.target.value)}
          disabled={prefill === "loading"}
          placeholder={prefill === "loading" ? "불러오는 중…" : undefined}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Genres" hint="쉼표로 구분">
        <input
          value={genres}
          onChange={(event) => setGenres(event.target.value)}
          disabled={prefill === "loading"}
          placeholder={prefill === "loading" ? "불러오는 중…" : undefined}
          className={FIELD_INPUT}
        />
      </Field>
      <Field label="Released On" composite>
        <DateField value={releasedOn} onChange={setReleasedOn} />
      </Field>
    </AdminFormDialog>
  );
}

/** 설정 화면의 FormDialog와 같은 모양. 저장·에러 처리를 한곳에 모은다 */
function AdminFormDialog({
  title,
  onClose,
  onSubmit,
  blocked = false,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  /** 저장 버튼을 잠근다 — 미리 채울 값이 아직 안 왔을 때 */
  blocked?: boolean;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {error && <span className="mr-auto text-xs text-red-400">{error}</span>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                onClose();
              } catch (caught) {
                setError(errorMessage(caught, "저장하지 못했습니다."));
                setBusy(false);
              }
            }}
          >
            {busy ? "저장 중" : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  );
}
