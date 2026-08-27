package com.milobeene.starlog.common.config;

import com.milobeene.starlog.backlog.domain.Acquisition;
import com.milobeene.starlog.backlog.domain.AcquisitionCommand;
import com.milobeene.starlog.backlog.domain.AcquisitionMethod;
import com.milobeene.starlog.backlog.domain.BacklogEntry;
import com.milobeene.starlog.backlog.domain.BacklogEntryGenre;
import com.milobeene.starlog.backlog.domain.OverrideCommand;
import com.milobeene.starlog.backlog.domain.Playthrough;
import com.milobeene.starlog.backlog.domain.PlaythroughCommand;
import com.milobeene.starlog.backlog.domain.PlaythroughStatus;
import com.milobeene.starlog.common.entity.Money;
import com.milobeene.starlog.game.domain.CatalogSyncCommand;
import com.milobeene.starlog.game.domain.Game;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.tag.domain.Genre;
import com.milobeene.starlog.tag.domain.Tag;
import com.milobeene.starlog.platform.domain.Device;
import com.milobeene.starlog.platform.domain.Emulator;
import com.milobeene.starlog.platform.domain.InputMethod;
import com.milobeene.starlog.platform.domain.Platform;
import com.milobeene.starlog.platform.service.DefaultCatalogSeeder;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
// "!test"가 아니라 "dev"인 이유 — !test는 prod를 포함한다. 첫 배포 때 빈 Neon DB에
// 테스트 계정(비밀번호 "1111")과 가짜 RAWG externalId가 들어가는 사고를 막는다.
// prod의 마스터 시딩은 Phase 9(Flyway V1__init.sql)의 몫이다
@Profile("dev")
@RequiredArgsConstructor
/*
 * 실행 순서를 못 박는다(1/3). @Order가 없으면 셋 다 LOWEST_PRECEDENCE라
 * **컴포넌트 스캔 발견 순서** = 파일시스템 열거 순서가 그대로 실행 순서가 된다.
 * 시드 데이터를 먼저 넣는다
 */
@Order(1)
public class DataInitializer implements ApplicationRunner {

    private final InitService initService;   // ← 자기 자신이 아닌 별도 빈을 주입

    @Override
    public void run(ApplicationArguments args) {
        initService.initTestMember();
        initService.initSampleBacklog();
    }

    @Component
    @Profile("dev")
    @RequiredArgsConstructor
    static class InitService {

        /** v1.0에는 로그인이 없다 — 비밀번호 자리에 넣을 것이 없다 */
        private static final String NO_PASSWORD = "(no-login)";

        private final EntityManager em;
            private final DefaultCatalogSeeder defaultCatalogSeeder;

        /**
         * 선택지는 이제 전역 마스터가 아니라 **회원 소유**다. 그래서 회원을 만든 뒤에 붙인다 —
         * 기본 세트는 가입 경로와 같은 시더가 넣고, 여기서는 시드 계정의 실제 기기·에뮬만 더한다
         */
        @Transactional
        public void initTestMember() {
            if (em.createQuery("select count(m) from Member m", Long.class)
                    .getSingleResult() > 0) {
                return;
            }
            // 원문 저장 금지 (AUTH-P3). 시드도 예외가 아니다 — dev DB를 그대로 덤프해도 원문이 안 남는다
            Member member = Member.signUpWithEmail(
                    "milo.beene@gmail.com", NO_PASSWORD, "Milo Beene");
            member.verifyEmail();   // 시드 계정은 바로 로그인되게 (I-4 이후 미인증은 로그인 403)
            member.approve(LocalDateTime.now());   // 승인제(FR-ADM-06)에 시드가 잠기지 않게
            /*
             * 시드 계정을 관리자로도 쓴다. 계정을 나누는 게 원칙적으로는 맞지만(최소 권한),
             * 1인 프로젝트에서 관리 작업마다 로그아웃/로그인 하는 비용이 더 크다.
             * 운영에서는 ADMIN_EMAIL 환경변수로 같은 승격이 일어난다 (AdminBootstrap)
             */
            member.promoteToAdmin();
            em.persist(member);

            defaultCatalogSeeder.seed(member);

            /*
             * 관리자 계정. 운영에서는 ADMIN_EMAIL/ADMIN_PASSWORD 환경변수로 AdminBootstrap이
             * 만들지만(OI-07), 로컬에서 매번 환경변수를 넣기 번거로워 dev 시드에 하나 둔다.
             * 이메일 자리에 "admin"을 넣는다 — 형식 검증은 가입 DTO에만 있고 로그인은 안 본다
             */
            Member admin = Member.signUpWithEmail("admin", NO_PASSWORD, "관리자");
            admin.verifyEmail();
            admin.approve(LocalDateTime.now());
            admin.promoteToAdmin();
            em.persist(admin);

            defaultCatalogSeeder.seed(admin);

            List.of("Windows PC", "MacBook Air M1", "iPhone 14",
                            "Nintendo 3DS XL", "Nintendo Switch", "Nintendo Switch Lite")
                    .forEach(type -> em.persist(new Device(member, type, type, null)));

            List.of("Ryujinx", "Eden", "Azahar", "Delta")
                    .forEach(name -> em.persist(new Emulator(member, name, null)));
        }

        /**
         * H-2 검증용 표본. ddl-auto: create라 재시작마다 날아가므로 매번 다시 넣는다.
         * 세 항목이 각각 다른 경우를 덮는다 — 개인 장르 있음 / 마스터 폴백 / 회차 0개
         */
        @Transactional
        public void initSampleBacklog() {
            if (em.createQuery("select count(b) from BacklogEntry b", Long.class)
                    .getSingleResult() > 0) {
                return;
            }

            // 이메일로 콕 집는다 — 관리자 계정이 생기면서 "첫 회원"이 더는 자명하지 않다
            Member member = em.createQuery(
                            "select m from Member m where m.email = :email", Member.class)
                    .setParameter("email", "milo.beene@gmail.com")
                    .getSingleResult();
            Device nintendoSwitch = byLabel(member, "Nintendo Switch");
            Device windowsPc = byLabel(member, "Windows PC");
            Platform nintendo = byName(member, Platform.class, "Nintendo");
            Platform steam = byName(member, Platform.class, "Steam");
            InputMethod pad = byName(member, InputMethod.class, "닌텐도 컨트롤러");

            // 태그는 항목당 하나다 (§6.7 v1.6). 사이드바 그룹을 눌러보려면 2종 + 무태그가 필요하다

            // 1) 오버라이드 + 개인 장르 + 진행 중 회차 — 카드가 가장 꽉 찬 경우
            // externalId는 진짜 IGDB id다 — 가짜를 넣으면 재동기화(J-5)를 시드로 눌러볼 수 없다
            Game ringFit = Game.fromCatalog("Ring Fit Adventure", "122338", LocalDateTime.now());
            ringFit.syncFromCatalog(new CatalogSyncCommand(
                    List.of("Nintendo"), List.of("Nintendo"), List.of("Sports"),
                    LocalDate.of(2019, 10, 18), "cobcnq", null,
                    "A fitness adventure game for Nintendo Switch.", null,
                    new BigDecimal("78.40"), 312, List.of("Switch"),
                    25, 37, 61, 41), LocalDateTime.now());
            em.persist(ringFit);

            BacklogEntry fit = BacklogEntry.of(member, ringFit);
            em.persist(fit);
            fit.updateOverrides(new OverrideCommand("링 피트 어드벤처",
                    List.of("닌텐도"), List.of(), null,
                    new Money(new BigDecimal("89800"), "KRW")));
            fit.updatePersonalRecord(new BigDecimal("83.0"), new BigDecimal("40.00"), "운동 겸 게임");
            linkGenres(fit, member, List.of("피트니스", "기능성"));
            fit.changeTag(persistTag(member, "운동"));
            addPlaythrough(fit, 1, LocalDate.of(2022, 1, 1), LocalDate.of(2023, 1, 1),
                    PlaythroughStatus.COMPLETED, nintendoSwitch, pad);
            addPlaythrough(fit, 2, LocalDate.of(2026, 5, 27), null,
                    PlaythroughStatus.PLAYING, nintendoSwitch, pad);
            addAcquisition(fit, AcquisitionMethod.PURCHASED, nintendo,
                    new BigDecimal("89800"), LocalDate.of(2022, 1, 1));

            // 2) 개인 장르 없음 → 마스터 장르로 폴백되는지 확인용
            Game hollowKnight = Game.fromCatalog("Hollow Knight", "14593", LocalDateTime.now());
            hollowKnight.syncFromCatalog(new CatalogSyncCommand(
                    List.of("Team Cherry"), List.of("Team Cherry"),
                    List.of("Platform", "Adventure", "Indie"), LocalDate.of(2017, 2, 24),
                    "cobfzp", "ar584c",
                    "Forge your own path in Hollow Knight!", null,
                    new BigDecimal("90.15"), 1834, List.of("PC", "Switch", "PS4"),
                    22, 37, 63, 29), LocalDateTime.now());
            em.persist(hollowKnight);

            BacklogEntry hollow = BacklogEntry.of(member, hollowKnight);
            em.persist(hollow);
            hollow.updatePersonalRecord(new BigDecimal("95.0"), new BigDecimal("62.00"), null);
            hollow.changeTag(persistTag(member, "명작"));
            addPlaythrough(hollow, 1, LocalDate.of(2024, 3, 1), LocalDate.of(2024, 4, 10),
                    PlaythroughStatus.PAUSED, windowsPc, pad);
            addAcquisition(hollow, AcquisitionMethod.PURCHASED, steam,
                    new BigDecimal("15000"), LocalDate.of(2024, 2, 20));

            // 3) 회차·취득 0개 → WISHLIST + 무태그. 정렬 키가 전부 null인 행이 하나는 있어야 한다
            Game stardew = Game.manual("Stardew Valley");
            em.persist(stardew);
            em.persist(BacklogEntry.of(member, stardew));
        }

        /*
         * **회원으로 좁혀야 한다.** 선택지가 회원 소유가 되면서 시드 계정과 관리자 계정이
         * 같은 이름의 플랫폼을 각자 갖는다 — 전역으로 찾으면 NonUniqueResultException이 난다
         */
        private Device byLabel(Member owner, String label) {
            return em.createQuery(
                            "select d from Device d where d.member = :owner and d.label = :label",
                            Device.class)
                    .setParameter("owner", owner)
                    .setParameter("label", label)
                    .getSingleResult();
        }

        private <T> T byName(Member owner, Class<T> type, String name) {
            return em.createQuery(
                            "select e from " + type.getSimpleName()
                                    + " e where e.member = :owner and e.name = :name", type)
                    .setParameter("owner", owner)
                    .setParameter("name", name)
                    .getSingleResult();
        }

        private Tag persistTag(Member member, String name) {
            Tag tag = new Tag(member, name);
            em.persist(tag);
            return tag;
        }

        private void linkGenres(BacklogEntry entry, Member member, List<String> names) {
            names.forEach(name -> {
                Genre genre = new Genre(member, name);
                em.persist(genre);
                BacklogEntryGenre link = new BacklogEntryGenre(entry, genre);
                em.persist(link);
                // 역방향 컬렉션은 읽기 전용이라 persist만으로는 안 들어온다.
                // resolvedGenres()가 방금 넣은 장르를 못 보면 폴백이 잘못 걸린다
                entry.addGenreLink(link);
            });
        }

        private void addPlaythrough(BacklogEntry entry, int sequenceNo,
                                    LocalDate startedOn, LocalDate finishedOn,
                                    PlaythroughStatus status, Device device,
                                    InputMethod inputMethod) {
            Playthrough playthrough = Playthrough.of(entry, sequenceNo,
                    new PlaythroughCommand(startedOn, finishedOn, status,
                            null, null, null, null, null));
            playthrough.assignReferences(device, null, null, inputMethod);
            em.persist(playthrough);
            entry.addPlaythrough(playthrough);
            entry.syncDerivedState();
        }

        private void addAcquisition(BacklogEntry entry, AcquisitionMethod method,
                                    Platform platform, BigDecimal amount, LocalDate acquiredOn) {
            Acquisition acquisition = Acquisition.of(entry,
                    new AcquisitionCommand(method, null, null, null, amount, "KRW", acquiredOn, null));
            acquisition.assignReferences(platform, null);
            em.persist(acquisition);
            entry.addAcquisition(acquisition);
            entry.syncDerivedState();
        }
    }
}
