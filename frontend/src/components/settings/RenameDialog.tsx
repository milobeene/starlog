"use client";

import { useState } from "react";
import { Field, FIELD_INPUT } from "@/components/ui/Field";
import FormDialog from "@/components/settings/FormDialog";
import { api, errorMessage } from "@/lib/api";
import { TAG_COLOR_NAMES, TAG_COLORS } from "@/lib/tagColors";
import type { FacetCount, TagFacet } from "@/lib/types";

export default function RenameDialog({
  item,
  basePath,
  onClose,
  onSaved,
}: {
  item: FacetCount;
  basePath: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  /** 색은 태그에만 있다. 장르·기기에는 자리 자체를 안 만든다 */
  const colorable = basePath.endsWith("/tags");
  const [color, setColor] = useState<string | null>(
    colorable ? ((item as TagFacet).color ?? null) : null,
  );

  return (
    <FormDialog
      title={colorable ? "태그 수정" : "이름 바꾸기"}
      onClose={onClose}
      onSubmit={async () => {
        await api.put(`${basePath}/${item.id}`, { name });
        /*
         * 색은 엔드포인트가 따로다 — 이름은 담긴 항목까지 파급이 있고 색은 표시뿐이라
         * 성질이 다르다. 안 바뀌었으면 부르지 않는다
         */
        if (colorable && color !== ((item as TagFacet).color ?? null)) {
          try {
            await api.put(`${basePath}/${item.id}/color`, { color });
          } catch (caught) {
            // 이름은 이미 바뀌었다 — 목록은 새로 읽고, 창은 열어 둔 채 색만 실패했다고 알린다
            onSaved();
            throw new Error(errorMessage(caught, "이름은 바꿨지만 색은 저장하지 못했습니다."));
          }
        }
        onSaved();
      }}
    >
      <p className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-white/45">
        적용 중인 <b className="text-white/75">{item.count}개 항목</b>에 일괄 반영됩니다.
      </p>
      {colorable && (
        <Field label="Color" hint="라이브러리의 사이드바와 폴더에 이 색이 쓰입니다">
          {/*
          ⚠️ **격자로 바꿨다** (v1.2, 사용자 지적). `flex-wrap`은 칩 폭이 글자 수를 따라가서
          줄마다 끝이 들쭉날쭉했다 — 색을 입히고 나니 그 지저분함이 더 도드라졌다.
          `auto-fill`은 폭이 남으면 칸을 더 만들고, 모자라면 줄을 바꾼다. 어느 폭에서도
          **오른쪽 끝이 가지런하다**
        */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1.5">
            {/* 색 없음 — 지금까지의 중립 회색 */}
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-label="색 없음"
              className={`h-7 w-7 rounded-full border-2 bg-white/10 transition-transform ${
                color === null ? "scale-110 border-white" : "border-transparent hover:scale-105"
              }`}
            />
            {TAG_COLOR_NAMES.map((name_) => (
              <button
                key={name_}
                type="button"
                onClick={() => setColor(name_)}
                aria-label={TAG_COLORS[name_].label}
                title={TAG_COLORS[name_].label}
                style={{ background: TAG_COLORS[name_].text }}
                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                  color === name_ ? "scale-110 border-white" : "border-transparent hover:scale-105"
                }`}
              />
            ))}
          </div>
        </Field>
      )}

      <Field label="Name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
          className={FIELD_INPUT}
        />
      </Field>
    </FormDialog>
  );
}
