package com.milobeene.gamebacklog.common.config;

import com.milobeene.gamebacklog.backlog.domain.Acquisition;
import com.milobeene.gamebacklog.backlog.domain.AcquisitionCommand;
import com.milobeene.gamebacklog.backlog.domain.AcquisitionMethod;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntry;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntryGenre;
import com.milobeene.gamebacklog.backlog.domain.BacklogEntryTag;
import com.milobeene.gamebacklog.backlog.domain.InputMethod;
import com.milobeene.gamebacklog.backlog.domain.OverrideCommand;
import com.milobeene.gamebacklog.backlog.domain.Playthrough;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughCommand;
import com.milobeene.gamebacklog.backlog.domain.PlaythroughStatus;
import com.milobeene.gamebacklog.common.entity.Money;
import com.milobeene.gamebacklog.game.domain.Game;
import com.milobeene.gamebacklog.member.domain.Member;
import com.milobeene.gamebacklog.tag.domain.Genre;
import com.milobeene.gamebacklog.tag.domain.Tag;
import com.milobeene.gamebacklog.platform.domain.Device;
import com.milobeene.gamebacklog.platform.domain.Emulator;
import com.milobeene.gamebacklog.platform.domain.Platform;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
// "!test"가 아니라 "dev"인 이유 — !test는 prod를 포함한다. 첫 배포 때 빈 Neon DB에
// 테스트 계정(비밀번호 "1111")과 가짜 RAWG externalId가 들어가는 사고를 막는다.
// prod의 마스터 시딩은 Phase 9(Flyway V1__init.sql)의 몫이다
@Profile("dev")
@RequiredArgsConstructor
public class DataInitializer implements ApplicationRunner {

    private final InitService initService;   // ← 자기 자신이 아닌 별도 빈을 주입

    @Override
    public void run(ApplicationArguments args) {
        initService.initMasters();
        initService.initTestMember();
        initService.initSampleBacklog();
    }

    @Component
    @Profile("dev")
    @RequiredArgsConstructor
    static class InitService {

        private final EntityManager em;

        @Transactional
        public void initMasters() {
            if (em.createQuery("select count(p) from Platform p", Long.class)
                    .getSingleResult() > 0) {
                return;   // 이미 있으면 건너뜀
            }

            List.of("Steam", "Nintendo", "Epic Games")
                    .forEach(name -> em.persist(Platform.of(name)));

            List.of("Windows PC", "MacBook Air M1", "iPhone 14",
                            "Nintendo 3DS XL", "Nintendo Switch", "Nintendo Switch Lite")
                    .forEach(name -> em.persist(Device.of(name)));

            List.of("Ryujinx", "Eden", "Azahar", "Delta")
                    .forEach(name -> em.persist(Emulator.of(name)));
        }

        @Transactional
        public void initTestMember() {
            if (em.createQuery("select count(m) from Member m", Long.class)
                    .getSingleResult() > 0) {
                return;
            }
            em.persist(Member.signUpWithEmail("milo.beene@gmail.com", "1111", "Milo Beene"));
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

            Member member = em.createQuery("select m from Member m order by m.id", Member.class)
                    .setMaxResults(1).getSingleResult();
            Device nintendoSwitch = byName(Device.class, "Nintendo Switch");
            Device windowsPc = byName(Device.class, "Windows PC");
            Platform nintendo = byName(Platform.class, "Nintendo");
            Platform steam = byName(Platform.class, "Steam");

            Tag masterpiece = persistTag(member, "명작");   // 두 항목이 같은 태그를 공유한다

            // 1) 오버라이드 + 개인 장르 + 진행 중 회차 — 카드가 가장 꽉 찬 경우
            Game ringFit = Game.fromRawg("Ring Fit Adventure", "rawg-42", LocalDateTime.now());
            ringFit.updateMasterInfo(List.of("Nintendo"), List.of("Nintendo"),
                    List.of("Sports"), LocalDate.of(2019, 10, 18), null);
            em.persist(ringFit);

            BacklogEntry fit = BacklogEntry.of(member, ringFit);
            em.persist(fit);
            fit.updateOverrides(new OverrideCommand("링 피트 어드벤처",
                    List.of("닌텐도"), List.of(), null,
                    new Money(new BigDecimal("89800"), "KRW")));
            fit.updatePersonalRecord(new BigDecimal("83.0"), 40, "운동 겸 게임");
            linkGenres(fit, member, List.of("피트니스", "기능성"));
            linkTag(fit, masterpiece);
            linkTag(fit, persistTag(member, "운동"));
            addPlaythrough(fit, 1, LocalDate.of(2022, 1, 1), LocalDate.of(2023, 1, 1),
                    PlaythroughStatus.COMPLETED, nintendoSwitch);
            addPlaythrough(fit, 2, LocalDate.of(2026, 5, 27), null,
                    PlaythroughStatus.PLAYING, nintendoSwitch);
            addAcquisition(fit, AcquisitionMethod.PURCHASED, nintendo,
                    new BigDecimal("89800"), LocalDate.of(2022, 1, 1));

            // 2) 개인 장르 없음 → 마스터 장르로 폴백되는지 확인용
            Game hollowKnight = Game.fromRawg("Hollow Knight", "rawg-9", LocalDateTime.now());
            hollowKnight.updateMasterInfo(List.of("Team Cherry"), List.of("Team Cherry"),
                    List.of("Action", "Indie"), LocalDate.of(2017, 2, 24), null);
            em.persist(hollowKnight);

            BacklogEntry hollow = BacklogEntry.of(member, hollowKnight);
            em.persist(hollow);
            hollow.updatePersonalRecord(new BigDecimal("95.0"), 62, null);
            linkTag(hollow, masterpiece);
            addPlaythrough(hollow, 1, LocalDate.of(2024, 3, 1), LocalDate.of(2024, 4, 10),
                    PlaythroughStatus.PAUSED, windowsPc);
            addAcquisition(hollow, AcquisitionMethod.PURCHASED, steam,
                    new BigDecimal("15000"), LocalDate.of(2024, 2, 20));

            // 3) 회차·취득 0개 → WISHLIST. 정렬 키가 전부 null인 행이 하나는 있어야 한다
            Game stardew = Game.manual("Stardew Valley");
            em.persist(stardew);
            em.persist(BacklogEntry.of(member, stardew));
        }

        private <T> T byName(Class<T> type, String name) {
            return em.createQuery(
                            "select e from " + type.getSimpleName() + " e where e.name = :name", type)
                    .setParameter("name", name)
                    .getSingleResult();
        }

        private Tag persistTag(Member member, String name) {
            Tag tag = new Tag(member, name);
            em.persist(tag);
            return tag;
        }

        private void linkTag(BacklogEntry entry, Tag tag) {
            em.persist(new BacklogEntryTag(entry, tag));
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
                                    PlaythroughStatus status, Device device) {
            Playthrough playthrough = Playthrough.of(entry, sequenceNo,
                    new PlaythroughCommand(startedOn, finishedOn, status,
                            null, null, null, InputMethod.NINTENDO, null));
            playthrough.assignReferences(device, null, null);
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
