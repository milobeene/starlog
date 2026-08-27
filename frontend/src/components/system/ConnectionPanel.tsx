"use client";

import { useEffect, useState } from "react";
import ConnectionForm from "@/components/entry/ConnectionForm";
import { Button } from "@/components/ui/Field";
import { getBridge, type ConnectionProfile } from "@/lib/desktop";

/**
 * 연결 설정 (v1.0 8단계).
 *
 * ## 이 화면만 백엔드를 안 쓴다
 *
 * DB 주소·스토리지 키·IGDB 키는 **`connections.json`에 있고 스프링은 그 파일을 모른다**
 * (architecture §7). 읽고 쓰는 건 일렉트론뿐이라, 여기는 `/api/*`가 아니라
 * `window.starlog`를 부른다 — 앱 안에서 그렇게 하는 유일한 자리다.
 *
 * ## 고쳐도 지금 세션에는 안 먹는다
 *
 * DataSource·스토리지 클라이언트는 **부팅할 때 조립된다**(architecture §2).
 * 그래서 여기서 바꾼 값은 다음에 그 연결로 들어올 때부터 적용되고,
 * 화면이 그걸 분명히 말해야 한다 — 안 그러면 "고쳤는데 안 되네"가 된다.
 *
 * 브라우저에서는 스스로 안내만 띄운다. 고칠 파일이 없기 때문이다
 */
export default function ConnectionPanel() {
  const [profiles, setProfiles] = useState<ConnectionProfile[] | null>(null);
  const [editing, setEditing] = useState<ConnectionProfile | null>(null);

  const reload = () => getBridge()?.connections.list().then(setProfiles);
  useEffect(() => {
    reload();
  }, []);

  if (!getBridge()) {
    return (
      <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/45">
        연결 설정은 데스크탑 앱에서만 볼 수 있습니다. 자격증명이 앱 폴더의 파일에 있고,
        웹에서는 그 파일에 닿을 수 없습니다.
      </p>
    );
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-5">
        <Notice />
        <ConnectionForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Notice />

      {profiles === null && <div className="h-16 animate-pulse rounded-lg bg-white/5" />}

      {profiles?.map((profile) => (
        <button
          key={profile.name}
          onClick={() => setEditing(profile)}
          className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06]"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-white/90">{profile.name}</span>
            <span className="mt-0.5 block truncate text-[11px] text-white/35">
              {hostOf(profile.db.url)}
              {profile.mediaTargets?.covers || profile.mediaTargets?.screenshots ? (
                <>
                  {" · 스토리지에 "}
                  {[
                    profile.mediaTargets?.covers && "커버",
                    profile.mediaTargets?.screenshots && "스크린샷",
                  ]
                    .filter(Boolean)
                    .join("·")}
                </>
              ) : (
                " · 미디어는 로컬"
              )}
            </span>
          </span>
          <span className="shrink-0 text-[11px] text-white/30">수정</span>
        </button>
      ))}

      {profiles?.length === 0 && (
        <p className="py-2 text-xs text-white/35">
          저장된 연결이 없습니다. 로컬 모드로 쓰고 계신 것 같습니다.
        </p>
      )}

      <div>
        <Button onClick={() => getBridge()!.backToEntry()}>입구로 나가서 바꾸기</Button>
      </div>
    </div>
  );
}

function Notice() {
  return (
    <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
      여기서 고친 값은 <b className="text-amber-100">다음에 이 연결로 들어올 때</b>부터
      적용됩니다. 데이터베이스와 스토리지는 앱이 시작할 때 한 번 연결되기 때문입니다.
    </p>
  );
}

/** `jdbc:postgresql://호스트/DB?...` 에서 사람이 알아볼 부분만 */
function hostOf(url: string) {
  const found = url.match(/\/\/([^/?]+)\/?([^?]*)/);
  if (!found) return url;
  return found[2] ? `${found[1]} / ${found[2]}` : found[1];
}
