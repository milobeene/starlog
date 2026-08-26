import type { Money } from "@/lib/types";
import { moneyParts } from "@/lib/labels";

/**
 * 금액 표시 — **통화 기호만 본문 폰트로 뺀다.**
 *
 * 숫자는 JetBrains Mono(`.num`)로 그려야 자릿수가 안 흔들리는데, 그 폰트에서 ₩·¥는
 * 균일 폭 규칙에 맞춰 늘어나 숫자와 무게·크기가 안 맞는다. 기호는 글자 수가 하나뿐이라
 * 폭을 고정할 이유도 없다 — 본문 폰트로 그리는 편이 자연스럽다.
 *
 * 문자열을 직접 쪼개지 않고 Intl의 formatToParts를 쓰는 이유 —
 * 통화마다 기호 위치가 다르다(₩1,000 / 1 000 €). 자르는 규칙을 우리가 알 필요가 없다
 */
export default function MoneyText({ money }: { money: Money | null }) {
  const parts = moneyParts(money);
  if (parts === null) return <>—</>;

  return (
    <>
      {parts.map((part, index) =>
        part.type === "currency" ? (
          <span
            key={index}
            /*
             * 크기를 0.92em으로 살짝 줄이고 오른쪽에 아주 얕은 간격을 준다.
             * 본문 폰트의 ₩는 숫자보다 커 보여서 그대로 두면 기호가 금액을 눌러 보인다
             */
            className="mr-[0.06em] font-sans text-[0.92em]"
          >
            {part.value}
          </span>
        ) : (
          <span key={index}>{part.value}</span>
        ),
      )}
    </>
  );
}
