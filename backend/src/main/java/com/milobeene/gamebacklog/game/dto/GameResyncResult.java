package com.milobeene.gamebacklog.game.dto;

/**
 * 재동기화 결과 (J-5). 관리자가 "무엇이 몇 건 바뀌었는지"를 봐야 하는 화면용.
 *
 * 두 수를 나눠 세는 이유 — 이름 전파는 이름 오버라이드가 없는 항목만 대상이고,
 * 출시일 전파는 전 항목이 대상이라 애초에 같은 수가 나오지 않는다
 */
public record GameResyncResult(
        boolean nameChanged,
        int renamedEntries,
        int reorderedEntries
) {
}
