package com.milobeene.starlog.admin.service;

import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.domain.MemberRole;
import com.milobeene.starlog.member.repository.MemberRepository;
import com.milobeene.starlog.platform.service.DefaultCatalogSeeder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * 관리자 계정 부트스트랩 (OI-07 결정 — 환경변수).
 *
 * `ADMIN_EMAIL`, `ADMIN_PASSWORD`가 있으면 기동 시 만들거나 승격한다.
 * DB를 직접 UPDATE하는 방식보다 재현 가능하고, Render 같은 곳에서 환경변수만 넣으면 된다.
 * 값이 없으면 아무 일도 하지 않는다 — 로컬에서 매번 관리자가 생기는 걸 원하지 않는다.
 *
 * 승격은 **멱등**이다. 이미 관리자면 건드리지 않고, 비밀번호도 덮어쓰지 않는다 —
 * 환경변수가 오래된 값일 때 운영 계정의 비밀번호가 되돌아가는 사고를 막는다.
 */
@Component
@RequiredArgsConstructor
/*
 * 실행 순서를 못 박는다(2/3). @Order가 없으면 셋 다 LOWEST_PRECEDENCE라
 * **컴포넌트 스캔 발견 순서** = 파일시스템 열거 순서가 그대로 실행 순서가 된다.
 * 시드가 만든 회원을 보고 판단해야 한다
 */
@Order(2)
public class AdminBootstrap implements ApplicationRunner {

    private final AdminBootstrapExecutor executor;

    @Override
    public void run(ApplicationArguments args) {
        executor.bootstrap();
    }

    /** @Transactional은 프록시 기반이라 같은 객체 안의 호출엔 안 걸린다 → 별도 빈으로 분리 (원칙 11번) */
    @Slf4j
    @Component
    @RequiredArgsConstructor
    static class AdminBootstrapExecutor {

        private final MemberRepository memberRepository;
        private final PasswordEncoder passwordEncoder;
        private final DefaultCatalogSeeder defaultCatalogSeeder;

        @Transactional
        public void bootstrap() {
            String email = System.getenv("ADMIN_EMAIL");
            String password = System.getenv("ADMIN_PASSWORD");

            if (email == null || email.isBlank() || password == null || password.isBlank()) {
                return;
            }

            String normalized = email.strip().toLowerCase(Locale.ROOT);
            memberRepository.findByEmail(normalized).ifPresentOrElse(
                    this::promote,
                    () -> create(normalized, password));
        }

        private void promote(Member member) {
            // 승격 대상이 승인 대기 상태일 수 있다. 관리자가 로그인 못 하면 아무도 승인할 수 없다
            member.approve(java.time.LocalDateTime.now());

            if (member.getRole() == MemberRole.ADMIN) {
                return;
            }
            member.promoteToAdmin();
            log.info("기존 회원을 관리자로 승격: {}", member.getEmail());
        }

        private void create(String email, String rawPassword) {
            Member admin = Member.signUpWithEmail(email, passwordEncoder.encode(rawPassword), "관리자");
            admin.verifyEmail();          // 관리자는 메일 인증 절차를 거치지 않는다
            admin.approve(java.time.LocalDateTime.now());   // 자기 자신을 승인할 수는 없으니 (FR-ADM-06)
            admin.promoteToAdmin();
            memberRepository.persist(admin);
            defaultCatalogSeeder.seed(admin);
            log.info("관리자 계정 생성: {}", email);
        }
    }
}
