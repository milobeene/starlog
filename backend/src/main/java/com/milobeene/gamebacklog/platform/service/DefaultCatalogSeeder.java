package com.milobeene.gamebacklog.platform.service;

import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.platform.domain.InputMethod;
import com.milobeene.gamebacklog.platform.domain.Platform;
import com.milobeene.gamebacklog.platform.repository.InputMethodRepository;
import com.milobeene.gamebacklog.platform.repository.PlatformRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 가입 직후 기본 선택지를 **내 데이터로 복사**한다.
 *
 * 예전엔 플랫폼·기기·에뮬이 전역 마스터라 모든 회원이 같은 행을 공유했고, 그래서
 * 이름 하나 고치려면 관리자 권한이 필요했다. 이제는 각자 자기 것을 갖고 자유롭게 고친다.
 *
 * **기기와 에뮬레이터는 넣지 않는다** — 남의 하드웨어 목록으로 시작하는 건 의미가 없고,
 * 기기는 유형·라벨·메모를 직접 적는 물건이다
 */
@Component
@RequiredArgsConstructor
public class DefaultCatalogSeeder {

    private static final List<String> PLATFORMS =
            List.of("Steam", "Epic Games", "GOG", "Nintendo", "PlayStation", "Xbox");

    /** 예전 InputMethod enum 4개를 사람이 읽는 이름으로 옮긴 것. V2 마이그레이션의 변환표와 같아야 한다 */
    private static final List<String> INPUT_METHODS =
            List.of("키보드 & 마우스", "Xinput 패드", "닌텐도 컨트롤러", "플레이스테이션 컨트롤러");

    private final PlatformRepository platformRepository;
    private final InputMethodRepository inputMethodRepository;

    /** 호출자의 트랜잭션 안에서 돈다 — 가입이 롤백되면 선택지도 함께 사라져야 한다 */
    public void seed(Member member) {
        PLATFORMS.forEach(name -> platformRepository.persist(new Platform(member, name)));
        INPUT_METHODS.forEach(name -> inputMethodRepository.persist(new InputMethod(member, name)));
    }
}
