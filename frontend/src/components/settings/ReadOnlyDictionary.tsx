"use client";

import { Fragment } from "react";

/** id가 없어 고칠 수 없는 사전 — 무엇이 쌓였는지만 보여준다 */
export default function ReadOnlyDictionary({ label, names }: { label: string; names: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">
          {label}
        </span>
        <span className="num text-[10px] text-white/25">{names.length}</span>
      </div>

      {names.length === 0 ? (
        <p className="text-xs text-white/25">직접 입력하신 값이 없습니다. 게임 상세에서 수정하시면 이곳에 표시됩니다.</p>
      ) : (
        /*
          ⚠️ **글자 양쪽 정렬처럼** 편다 (v1.2, 사용자 지정).
          격자로 폭을 균등하게 나눠봤더니 짧은 태그가 쓸데없이 넓어졌다 —
          원한 것은 **칸을 늘리는 게 아니라 사이를 벌리는 것**이다.
          `text-align: justify`는 인라인 요소에 먹으므로 칩을 `inline-flex`로 둔다.

          ⚠️ **`::after` 트릭을 쓰지 않는다.** 그건 마지막 줄까지 억지로 펴는 장치인데,
          그러면 태그가 두 개 남은 줄이 화면 폭만큼 벌어져 보인다 —
          justify는 원래 마지막 줄을 왼쪽 정렬로 둔다. 그게 맞는 모양이다 (사용자 지정).

          ⚠️ `Dictionary`와 같은 칩이어야 한다 — `inline-flex`·`whitespace-nowrap`이 없으면 justify가
          이름 **안의** 공백을 늘리고 칩이 두 줄로 쪼개진다. 칩 사이 진짜 공백도 그래서 넣는다
        */
        <div className="text-justify">
          {names.map((name) => (
            <Fragment key={name}>
              <span className="mb-1.5 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 align-middle text-xs whitespace-nowrap text-white/60">
                {name}
              </span>{" "}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
