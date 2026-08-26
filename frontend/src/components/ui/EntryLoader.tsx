/**
 * 입구 페이지의 세션 판정 대기 연출.
 *
 * **왜 스피너가 아닌가** — 배경(FluidBackground)이 가로로 흐르는 그라디언트다.
 * 도는 물건을 얹으면 두 운동이 싸운다. 같은 방향으로 훑고 지나가는 빛이라야 겉돌지 않는다.
 *
 * Render 무료 티어는 15분 무활동이면 잠들고 깨는 데 **3분까지** 걸린다.
 * 그동안 "멈춘 것"이 아니라 "일하는 중"으로 보여야 해서, 빛이 계속 왕복한다
 */
export default function EntryLoader() {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="relative h-px w-56 overflow-hidden bg-white/12">
        <span
          className="absolute inset-y-0 left-0 w-[40%] bg-gradient-to-r from-transparent via-white/80 to-transparent"
          style={{ animation: "starlog-sweep 1.9s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}
        />
      </div>

      <span
        className="text-[10px] tracking-[0.32em] text-white/40 uppercase"
        style={{ animation: "starlog-breathe 2.8s ease-in-out infinite" }}
      >
        기록을 여는 중
      </span>
    </div>
  );
}
