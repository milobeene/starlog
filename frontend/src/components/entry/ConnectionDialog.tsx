"use client";

import Modal from "@/components/ui/Modal";
import { Button, FIELD_INPUT } from "@/components/ui/Field";
import { Labeled, SectionFooter } from "./ConnectionFormParts";
import { DatabaseSection, IgdbSection, StorageSection, TranslateSection } from "./ConnectionSections";
import { useConnectionForm } from "./useConnectionForm";
import type { SectionKey } from "@/lib/connectionDraft";
import type { ConnectionProfile, SecretFieldPath } from "@/lib/desktop";

/**
 * 데이터베이스 연결 한 벌 (2026-08-28에 팝업으로 다시 만듦).
 *
 * ## 왜 팝업인가
 *
 * 입구 안에 펼쳐 놓으니 **창보다 길어져서** 위아래가 잘렸다. 팝업이면 제목과 버튼이
 * 고정되고 가운데만 구른다 — 어디까지 왔는지, 뭘 눌러야 하는지가 늘 보인다.
 *
 * ## 저장은 연결 테스트를 통과해야 열린다
 *
 * 예전엔 아무거나 저장되고, 그걸로 접속하면 **빈 화면만 하염없이** 나왔다.
 * 실제로 그렇게 겪었다. 이제 테스트가 성공해야 저장이 열리고, 입력이 바뀌면 다시 닫힌다.
 *
 * ## 묶음은 전부 채우거나 전부 비우거나
 *
 * 스토리지·IGDB는 선택이지만 **반만 채운 것은 안 채운 것보다 나쁘다** — 조용히 실패하고
 * 원인이 안 보인다. 하나라도 채웠으면 나머지도 채우게 막는다
 */
export default function ConnectionDialog({
  initial,
  inline = false,
  mode = "cloud",
  notice = null,
  reveal,
  onClose,
  onSaved,
}: {
  initial?: ConnectionProfile;
  /**
   * 팝업이 아니라 자리에 그대로 편다 (앱 안의 연결 탭).
   *
   * 앱 안에서는 연결이 언제나 하나라 고르는 단계가 없고, 나가려면 탭을 옮기면 된다 —
   * **취소 버튼이 뜻을 잃는다.** 입구에서는 여러 개 중 하나를 고르므로 팝업이 맞다
   */
  inline?: boolean;
  /**
   * 어느 세이브인가 (v1.2).
   *
   * `local`이면 **DB·스토리지 섹션이 없다** — 로컬 세이브파일에는 연결 설정이라는 게
   * 없기 때문이다. IGDB·번역은 `app_setting`에 저장되므로 `connections.json`을 안 거친다.
   *
   * ⚠️ 예전엔 로컬 전용 화면을 따로 만들어 뒀는데, **같은 일을 하는 화면 둘이
   * 서로 다르게 생겼다** — 버튼 위치도 알림도 달랐다. 한 컴포넌트로 합쳐 그걸 없앤다
   */
  mode?: "cloud" | "local";
  /** 바깥에서 온 알림(저장 완료 등). 결과·진행과 **같은 자리**에 모아 보여준다 */
  notice?: string | null;
  /** 눈 버튼이 진짜 값을 받아 오는 곳 — 로컬 세이브는 서버에서 받는다 (`useConnectionForm`) */
  reveal?: (path: SecretFieldPath) => Promise<string | null>;
  onClose: () => void;
  onSaved: (profile: ConnectionProfile) => void;
}) {
  const {
    form,
    patch,
    setDb,
    setStorage,
    setIgdb,
    setTargets,
    testing,
    busy,
    partResult,
    showGaps,
    gaps,
    formError,
    storageReady,
    canTest,
    canSave,
    bad,
    test,
    save,
    testSection,
    saveSection,
    secretProps,
  } = useConnectionForm({ initial, mode, onSaved, reveal });

  const footer = (part: SectionKey, ready: boolean) => (
    <SectionFooter
      inline={inline}
      ready={ready}
      state={busy[part]}
      found={partResult[part]}
      onTest={() => testSection(part)}
      onSave={() => saveSection(part)}
    />
  );

  /*
   * **한 줄이다.** 진행과 결과는 알림(`TaskToasts`)이 맡는다 — 여기에도 로딩바를 두면
   * 같은 것을 두 군데서 말하게 되고, 폼을 닫으면 그중 하나가 사라져 앞뒤가 안 맞는다
   */
  const actions = (
    <>
      <span className={`mr-auto text-[11px] ${formError && !testing ? "text-red-400" : "text-white/35"}`}>
        {testing
          ? "확인 중입니다. 다른 화면에 다녀오셔도 됩니다"
          : formError
            ? formError
            : notice
              ? notice
              : canSave
                ? ""
                : canTest
                  ? "연결 테스트를 통과해야 저장할 수 있습니다"
                  : "필수 항목을 채워 주세요"}
      </span>
      {!inline && (
        <Button onClick={onClose} disabled={testing}>
          취소
        </Button>
      )}
      <Button onClick={test} disabled={testing}>
        {testing ? "확인 중…" : "전체 테스트"}
      </Button>
      <Button variant="primary" onClick={save} disabled={testing}>
        저장
      </Button>
    </>
  );

  /* 테스트 중에는 아무것도 못 만진다 — 값이 바뀌면 시험 중인 대상과 화면이 어긋난다 */
  const body = (
    <fieldset disabled={testing} className={`flex flex-col gap-5 ${testing ? "opacity-50" : ""}`}>
      {/*
        이름·DB·스토리지는 **클라우드에만 있다** (v1.2). 로컬 세이브파일에는
        연결 설정이라는 게 없고, 이름은 입구의 세이브 이름이 대신한다
      */}
      {initial?.locked && (
        <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
          저장된 비밀번호와 키를 이 컴퓨터의 키체인에서 열지 못했습니다. 비밀 칸을 다시 입력해
          저장해 주세요 — 나머지 값은 그대로 있습니다.
        </p>
      )}
      {mode === "cloud" && (
        <>
          <Labeled label="이름" hint="목록에서 이 연결을 부를 이름입니다" bad={bad("name")}>
            <input
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="내 Neon"
              className={FIELD_INPUT}
            />
          </Labeled>

          <DatabaseSection
            form={form}
            secret={secretProps}
            setDb={setDb}
            bad={bad}
            disabled={busy.db !== undefined}
            footer={footer("db", Boolean(form.db.url.trim() && form.db.user.trim()))}
          />

          {/*
            스토리지 테스트는 **메모리 DB로** 시험용을 띄운다 — 위 데이터베이스 칸이 틀려도
            스토리지만 따로 볼 수 있다. 섹션별 테스트가 뜻을 가지려면 그래야 한다
          */}
          <StorageSection
            form={form}
            secret={secretProps}
            setStorage={setStorage}
            setTargets={setTargets}
            storageReady={storageReady}
            bad={bad}
            disabled={busy.storage !== undefined}
            footer={footer("storage", storageReady)}
          />

        </>
      )}

      <IgdbSection
        form={form}
        secret={secretProps}
        setIgdb={setIgdb}
        bad={bad}
        disabled={busy.igdb !== undefined}
        footer={footer(
          "igdb",
          Boolean(form.igdb?.clientId?.trim() && form.igdb?.clientSecret?.trim()),
        )}
      />

      <TranslateSection
        form={form}
        secret={secretProps}
        onChange={(v) => patch({ translate: { apiKey: v } })}
        disabled={busy.translate !== undefined}
        footer={footer("translate", Boolean(form.translate?.apiKey?.trim()))}
      />

      {showGaps && gaps.length > 0 && (
        <p className="text-[11px] leading-relaxed text-red-400">
          빨갛게 표시된 칸을 채워 주세요. 스토리지나 IGDB를 쓰지 않으시려면 그 묶음을
          <b> 모두 비워</b> 주세요 — 일부만 채우면 조용히 실패합니다.
        </p>
      )}
    </fieldset>
  );

  if (inline) {
    return (
      <div className="flex flex-col gap-5">
        {body}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-5">
          {actions}
        </div>
      </div>
    );
  }

  return (
    <Modal
      title={initial ? "연결 수정" : "새 연결"}
      width="max-w-2xl"
      /* 테스트 중에도 닫을 수 있다 — 결과는 알림이 들고 있고, 값은 초안이 지킨다 */
      onClose={onClose}
      footer={actions}
    >
      {body}
    </Modal>
  );
}
