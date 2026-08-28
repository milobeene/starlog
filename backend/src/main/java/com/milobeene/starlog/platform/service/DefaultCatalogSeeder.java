package com.milobeene.starlog.platform.service;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.repository.InputMethodRepository;
import com.milobeene.starlog.platform.repository.PlatformRepository;
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

    /**
     * 새 세이브파일에 깔리는 플랫폼 (사용자 결정 2026-08-28).
     *
     * **순서가 곧 화면 순서다** — 많이 쓰는 것부터. 알파벳순으로 두면 GOG가 위로 올라와
     * 실제로 고르는 빈도와 어긋난다
     */
    private static final List<String> PLATFORMS = List.of(
            "Steam", "Epic Games", "Nintendo", "PlayStation", "Xbox", "GOG", "itch.io");

    /**
     * 입력방식 (사용자 결정 2026-08-28에 영문으로 바꿈).
     *
     * 한글 이름("키보드 & 마우스")은 **`&`가 섞여 있어** 눈에 걸렸고, 플랫폼이 전부 영문인데
     * 여기만 한글이라 목록 두 개가 따로 노는 느낌이었다.
     *
     * ⚠️ **이미 있는 세이브파일은 안 바뀐다.** 시드는 계정을 처음 만들 때만 도므로,
     * 옛 세이브파일에는 한글 이름이 그대로 남는다 — 그게 맞다. 사람이 붙인 이름을
     * 앱이 마음대로 바꾸면 회차에 적어둔 것과 어긋난다
     */
    private static final List<String> INPUT_METHODS =
            List.of("KeyboardMouse", "XInput", "Nintendo", "PlayStation");

    private final PlatformRepository platformRepository;
    private final InputMethodRepository inputMethodRepository;

    /** 호출자의 트랜잭션 안에서 돈다 — 가입이 롤백되면 선택지도 함께 사라져야 한다 */
    public void seed(Member member) {
        PLATFORMS.forEach(name -> platformRepository.persist(new Platform(member, name)));
        INPUT_METHODS.forEach(name -> inputMethodRepository.persist(new InputMethod(member, name)));
    }
}
