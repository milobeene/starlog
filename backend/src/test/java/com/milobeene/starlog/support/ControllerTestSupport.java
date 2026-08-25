package com.milobeene.starlog.support;

import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.game.repository.GameRepository;
import com.milobeene.starlog.member.domain.Member;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
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
@Import({FakeGameCatalogClient.class, FakeFileStorage.class})
public abstract class ControllerTestSupport {

    protected MockMvc mockMvc;

    @Autowired private WebApplicationContext context;
    @Autowired protected EntityManager em;

    /**
     * 모든 컨트롤러 테스트가 가짜 외부 DB를 쓴다 (개별 @Import가 아니라 여기서 한 번에).
     * 검색을 부르는 테스트가 하나라도 진짜 클라이언트를 타면 실제 IGDB로 나가는데,
     * 그게 어느 테스트인지는 미리 알 수 없다
     */
    @Autowired protected FakeGameCatalogClient catalog;

    /** 커버 업로드도 같은 이유로 전 테스트가 가짜를 쓴다 (K-2) */
    @Autowired protected FakeFileStorage storage;

    /**
     * 모든 요청에 CSRF 토큰을 기본으로 실어준다.
     *
     * I-3에서 CSRF를 켜면서 쓰기 테스트가 전부 403이 됐다. 테스트 100개에 .with(csrf())를
     * 붙이는 대신 defaultRequest로 한 곳에서 처리한다 — 병합되어 모든 요청에 적용된다.
     * CSRF 자체가 동작하는지는 CsrfTest에서 토큰 없이 보내 따로 확인한다.
     */
    @BeforeEach
    void setUpMockMvc() {
        // 스프링 빈은 테스트 사이에 재사용된다 — 상태를 안 지우면 앞 테스트가 심은 결과가 넘어온다
        catalog.reset();
        storage.reset();

        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .defaultRequest(get("/").with(csrf()))
                .build();
    }
    @Autowired protected GameRepository gameRepository;
    @Autowired protected org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    /**
     * nanoTime으로 이메일 유니크 제약을 피한다 — 한 테스트가 회원을 여럿 만들 수 있다.
     * 비밀번호는 실제와 같게 인코딩해 넣는다(원문 "1111") — 원문을 넣어두면 로그인이 되는 것처럼
     * 보이는 테스트를 쓸 수 없다
     */
    protected Member saveMember() {
        Member member = Member.signUpWithEmail(
                "t" + System.nanoTime() + "@example.com", passwordEncoder.encode("1111"), "테스터");
        em.persist(member);
        return member;
    }

    protected Game saveGame(String name) {
        Game game = Game.manual(name);
        gameRepository.persist(game);
        return game;
    }
}
