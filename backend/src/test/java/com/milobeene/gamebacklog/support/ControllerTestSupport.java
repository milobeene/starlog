package com.milobeene.gamebacklog.support;

import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.game.repository.GameRepository;
import com.milobeene.gamebacklog.member.domain.Member;
import jakarta.persistence.EntityManager;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 컨트롤러 통합 테스트 공통 베이스. 설정 애노테이션과 바이트 단위로 같던
 * saveMember/saveGame 픽스처를 한 곳으로 모았다 — 4개 클래스가 각자 들고 있으면
 * Member.signUpWithEmail 시그니처가 바뀔 때 4곳을 동시에 고쳐야 한다.
 *
 * 스프링 테스트 애노테이션은 부모 클래스에서 상속된다 — 자식은 아무것도 안 붙여도 된다.
 *
 * 주의 — @Transactional이 요청 전체를 한 트랜잭션으로 감싸므로
 * LazyInitializationException은 여기서 재현되지 않는다. 그건 앱을 실제로 띄워 확인한다
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public abstract class ControllerTestSupport {

    @Autowired protected MockMvc mockMvc;
    @Autowired protected EntityManager em;
    @Autowired protected GameRepository gameRepository;

    /** nanoTime으로 이메일 유니크 제약을 피한다 — 한 테스트가 회원을 여럿 만들 수 있다 */
    protected Member saveMember() {
        Member member = Member.signUpWithEmail("t" + System.nanoTime() + "@example.com", "1111", "테스터");
        em.persist(member);
        return member;
    }

    protected Game saveGame(String name) {
        Game game = Game.manual(name);
        gameRepository.persist(game);
        return game;
    }
}
