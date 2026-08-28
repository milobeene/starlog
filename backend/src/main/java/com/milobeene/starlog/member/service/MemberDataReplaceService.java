package com.milobeene.starlog.member.service;

import com.milobeene.starlog.member.dto.MemberExport;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 내 데이터를 **통째로 갈아끼운다** (2026-08-28).
 *
 * ## 왜 병합이 아니라 덮어쓰기인가
 *
 * `MemberImportService`는 빈 계정에만 넣는다 — "같은 항목인가"를 판정할 방법이 없어서다
 * (같은 게임의 회차 두 벌이 같은 것인지 다른 것인지 알 길이 없다). 그 판단은 지금도 유효하다.
 *
 * 그런데 **로컬 세이브파일을 데이터베이스로 올리는 길**이 필요해졌다. 반대 방향(뽑기)은
 * 있는데 이쪽이 없어서, 밖에서 정리한 기록을 다시 올릴 수가 없었다.
 * 병합을 못 하는 이상 남은 답은 하나다 — **지우고 붓는다.**
 *
 * ## 지우기 전에 반드시 빠져나갈 구멍을 만든다
 *
 * ⚠️ **이 클래스는 그 구멍을 만들지 않는다.** 일렉트론이 덮어쓰기 직전에 대상을 로컬
 * 세이브파일로 뽑아둔다(`main.js`의 `saveFile:toCloud`). 클라우드에는 백업이 없다는 게
 * 9단계의 전제였는데, 이 기능이 정확히 그 구멍을 건드리기 때문이다.
 *
 * ## 마스터 게임은 안 지운다
 *
 * `Game`은 회원 소유가 아니라 공용이다. 지우면 다른 데서 쓰던 참조가 끊기고,
 * 안 지워서 생기는 건 아무도 안 담은 마스터 행 몇 개뿐이다 — 그건 손해가 아니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MemberDataReplaceService {

    private final EntityManager em;
    private final MemberImportService memberImportService;

    /**
     * 자식 → 부모 순서. **이 목록의 순서가 곧 명세다.**
     *
     * `BacklogService.purge`가 항목 하나에 대해 하는 것과 같은 규칙을 회원 전체로 넓혔다.
     * 순서 근거는 V1 마이그레이션의 FK다:
     * <ul>
     *   <li>취득은 플랫폼·계정·구독을 참조한다 → 그것들보다 먼저</li>
     *   <li>회차는 기기·에뮬·계정·입력방식을 참조한다 → 그것들보다 먼저</li>
     *   <li>항목의 장르 연결은 장르를 참조한다 → 장르보다 먼저</li>
     *   <li>계정은 플랫폼을 참조한다 → 플랫폼보다 먼저</li>
     * </ul>
     */
    private static final List<String> ENTRY_CHILDREN = List.of(
            "delete from BacklogEntryGenre x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :id)",
            "delete from CoverImage x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :id)",
            "delete from Acquisition x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :id)",
            "delete from Playthrough x where x.backlogEntry in (select b from BacklogEntry b where b.member.id = :id)");

    /** 항목을 지운 뒤에야 지울 수 있는 것들 */
    private static final List<String> OWNED_CATALOG = List.of(
            "delete from PlatformAccount x where x.member.id = :id",
            "delete from Platform x where x.member.id = :id",
            "delete from Device x where x.member.id = :id",
            "delete from Emulator x where x.member.id = :id",
            "delete from InputMethod x where x.member.id = :id",
            "delete from Subscription x where x.member.id = :id",
            "delete from Genre x where x.member.id = :id",
            "delete from Tag x where x.member.id = :id");

    /**
     * 지우고 붓는다. **한 트랜잭션이다** — 중간에 실패하면 옛 데이터가 그대로 남는다.
     *
     * @return 새로 들어간 것의 수
     */
    @Transactional
    public MemberImportService.Result replace(Long memberId, MemberExport data) {
        wipe(memberId);
        /*
         * 지운 직후에 붓는다. `importInto`는 "빈 계정인가"를 확인하는데, 방금 비웠으므로
         * 통과한다 — **같은 트랜잭션 안이라 그 검사가 우리가 지운 결과를 본다**
         */
        return memberImportService.importInto(memberId, data);
    }

    private void wipe(Long memberId) {
        /*
         * 순환 참조를 먼저 끊는다. `BacklogEntry ↔ Playthrough`가 서로를 참조해서
         * (lastPlaythrough 비정규화) 이걸 안 하면 회차 삭제가 FK에 걸린다.
         *
         * 벌크는 `@LastModifiedDate` 콜백이 안 도니 updatedAt을 SET 절에 직접 쓴다 (설계 원칙 13)
         */
        em.createQuery("""
                        update BacklogEntry b
                           set b.lastPlaythrough = null, b.updatedAt = :now
                         where b.member.id = :id
                        """)
                .setParameter("id", memberId)
                .setParameter("now", LocalDateTime.now())
                .executeUpdate();
        em.flush();

        ENTRY_CHILDREN.forEach(jpql -> em.createQuery(jpql)
                .setParameter("id", memberId)
                .executeUpdate());

        /*
         * 벌크는 영속성 컨텍스트를 우회한다 — 방금 지운 자식들이 컨텍스트에 남아 있다가
         * 부모를 지울 때 다시 flush되면 이미 없는 행을 건드린다. 비우고 나서 부모를 지운다
         */
        em.clear();
        int entries = em.createQuery("delete from BacklogEntry b where b.member.id = :id")
                .setParameter("id", memberId)
                .executeUpdate();

        OWNED_CATALOG.forEach(jpql -> em.createQuery(jpql)
                .setParameter("id", memberId)
                .executeUpdate());
        em.clear();

        log.info("덮어쓰기 전 정리 — 지운 항목 {}건. memberId={}", entries, memberId);
    }
}
