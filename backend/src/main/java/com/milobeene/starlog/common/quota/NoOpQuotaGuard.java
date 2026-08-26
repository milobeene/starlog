package com.milobeene.starlog.common.quota;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 쿼터 없는 빌드 — 로컬 앱(v1.0)용.
 *
 * `local-app` 프로파일로 뜨면 이게 붙고 `DbQuotaGuard`는 아예 안 올라온다.
 * **기본이 웹인 이유** — 오늘의 동작이 기본이어야 지금 개발·배포가 아무것도 안 바뀐다.
 * 미래의 변종이 스스로 손을 드는 쪽이 맞다
 */
@Profile("local-app")
@Component
public class NoOpQuotaGuard implements QuotaGuard {

    @Override
    public void consume(Long memberId, QuotaKind kind) {
        // 나 혼자 쓰는 앱에 하루 200번 제한을 둘 이유가 없다
    }

    @Override
    public List<QuotaStatus> statusOf(Long memberId) {
        return List.of();   // 빈 목록이면 화면이 그 섹션을 통째로 안 그린다
    }
}
