package com.milobeene.starlog.common.quota;

/**
 * 하루치 사용량 한 줄 — **엔티티가 아니라 값이다.**
 *
 * 엔티티로 읽으면 영속성 컨텍스트의 1차 캐시가 끼어들어, 같은 트랜잭션에서 벌크 UPDATE가
 * 이미 돌았어도 **옛 값을 돌려준다** (설계 원칙 13). 실제로 관리자 테스트에서
 * 23을 쓰고 1이 나왔다. 생성자 표현식은 매번 DB를 본다
 */
public record DailyUsage(QuotaKind kind, int used) {
}
