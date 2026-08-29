import Link from "next/link";
import GameCover from "./GameCover";
import StatusBadge from "./StatusBadge";
import Chip from "./Chip";
import StarIcon from "./StarIcon";
import { formatLastPlaythrough, formatRating } from "@/lib/labels";
import type { BacklogCard } from "@/lib/types";

/**
 * 라이브러리 그리드 카드.
 *
 * 평점과 마지막 플레이 줄은 **없어도 자리를 차지한다** — 값이 빠진 카드가
 * 짧아지면 그리드 행이 들쭉날쭉해진다. 투명 텍스트로 높이만 남긴다
 */
export default function GameCard({ card }: { card: BacklogCard }) {
  const lastLine = formatLastPlaythrough(card.lastPlaythrough);

  return (
    <Link
      href={`/library/detail?entry=${card.entryId}`}
      /*
       * 폴더로 끌어다 놓아 태그를 옮긴다 (2026-08-29). 사이드바 항목과 같은 키를 쓴다 —
       * 받는 쪽이 하나면 보내는 쪽도 하나여야 헷갈리지 않는다
       */
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/entry-id", String(card.entryId))}
      className="group flex cursor-pointer flex-col"
    >
      <div className="relative mb-3">
        {/*
          **플레이 중이면 커버가 빛난다** (v1.1.3). 상태 배지가 이미 있지만 작아서
          그리드를 훑을 때 "지금 하는 것"이 한눈에 안 들어왔다.

          ⚠️ **그림자를 커버 자신에게 준다.** 바깥 껍데기에 주면 그쪽은 반경이 없고
          크기도 커버와 미묘하게 달라서, 빛이 **커버에서 어긋난 네모**로 뜬다 (실제로 그랬다).
          이 요소가 `rounded-xl`과 커버의 정확한 상자를 들고 있는 유일한 곳이다
        */}
        <GameCover
          coverUrl={card.coverUrl}
          coverImageId={card.coverImageId}
          name={card.displayName}
          /*
            호버하면 빛이 **오므라든다** — 커버가 확대되는 것과 같은 500ms·ease-out이라
            둘이 한 동작으로 읽힌다. 다른 속도면 빛만 따로 노는 것처럼 보인다
          */
          className={
            card.status === "PLAYING"
              ? "shadow-[0_0_22px_-2px_rgba(52,211,153,0.65)] transition-[box-shadow] duration-500 ease-out group-hover:shadow-[0_0_8px_-3px_rgba(52,211,153,0.45)]"
              : ""
          }
        />
        <div className="absolute top-2 left-2.5 z-10">
          <StatusBadge status={card.status} />
        </div>
      </div>

      {/*
        한 줄로 자르고 넘치면 `…`. 두 줄이던 것을 줄인 것이라 카드가 그만큼 짧아졌다 —
        모든 카드가 똑같이 짧아지므로 그리드 행 높이는 여전히 고르다.
        title을 함께 두는 이유: 잘린 이름을 확인할 방법이 이것뿐이다
      */}
      <h4 className="mb-1.5 truncate text-sm leading-snug font-medium" title={card.displayName}>
        {card.displayName}
      </h4>

      {/*
        **무조건 한 줄이다.** flex-wrap이면 카드마다 높이가 달라져 그리드 줄이 어긋난다.
        칩 두 개가 안 들어가는 폭에서는 두 번째를 CSS로 숨긴다 —
        개수를 자바스크립트로 재면 폭마다 다시 재야 하고 그만큼 리렌더가 붙는다
      */}
      {/*
        **무조건 한 줄이다.** flex-wrap이면 카드마다 높이가 달라져 그리드 줄이 어긋난다.
        좁은 칸(md 미만)에서는 두 번째 칩을 숨긴다 — 두 개가 나란히 들어갈 폭이 안 나온다.

        Chip에 클래스를 넘기지 않고 **부모 선택자**로 숨기는 이유 —
        Chip의 기본 클래스에 `inline-flex`가 있어서 자식에 `hidden`을 붙여도
        같은 우선순위끼리 부딪혀 CSS 출력 순서에 따라 진다.
        `[&>*:nth-child(2)]:hidden`은 자손 선택자라 우선순위가 한 단계 높아 확실히 이긴다
      */}
      <div className="mb-1.5 flex min-h-[18px] gap-1 overflow-hidden [&>*]:shrink-0 [&>*:nth-child(2)]:hidden md:[&>*:nth-child(2)]:inline-flex">
        {card.genres.slice(0, 2).map((genre) => (
          <Chip key={genre} label={genre} />
        ))}
      </div>

      <div
        className={`mb-1 flex items-center gap-1 text-xs ${card.rating == null ? "text-white/20" : "text-yellow-500"}`}
      >
        {card.rating == null ? (
          "—"
        ) : (
          <>
            <StarIcon className="h-3.5 w-3.5 -translate-y-[0.5px]" />
            <span className="num">{formatRating(card.rating)}</span>
          </>
        )}
      </div>

      <div
        className={`num truncate text-[11px] ${lastLine ? "text-white/40" : "text-transparent select-none"}`}
      >
        {lastLine ?? "—"}
      </div>
    </Link>
  );
}
