package com.milobeene.starlog.member.service;

import com.milobeene.starlog.common.storage.FileStoragePort;
import com.milobeene.starlog.common.exception.ConflictException;
import com.milobeene.starlog.common.exception.NotFoundException;
import com.milobeene.starlog.member.domain.Member;
import com.milobeene.starlog.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;

/**
 * 탈퇴 유예 (FR-AUTH-09, 10).
 *
 * 유예 중에도 **인증은 통과한다.** 막히는 건 인가다 — 로그인은 되지만 권한이
 * ROLE_PENDING_DELETION으로 바뀌어 복구 외에는 아무것도 못 한다.
 * "로그인부터 막으면" 복구 화면으로 유도할 방법이 없어진다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WithdrawalService {

    public static final Duration GRACE_PERIOD = Duration.ofDays(30);

    private final MemberRepository memberRepository;
    private final MemberPurgeService memberPurgeService;
    private final FileStoragePort fileStorage;

    @Transactional
    public void withdraw(Long memberId) {
        Member member = findMember(memberId);
        if (member.getDeletedAt() != null) {
            throw new ConflictException("이미 탈퇴를 요청한 계정입니다");
        }

        member.withdraw(LocalDateTime.now());

        // 세션에 실린 권한은 로그인 시점에 굳는다. 안 끊으면 유예 상태인데도
        // 기존 탭에서는 ROLE_USER로 계속 돌아다닐 수 있다
    }

    @Transactional
    public void restore(Long memberId) {
        Member member = findMember(memberId);
        if (member.getDeletedAt() == null) {
            throw new ConflictException("탈퇴 요청 상태가 아닙니다");
        }

        member.restore();
    }

    /**
     * 유예 만료 배치 (I-8, FR-SYS-06).
     *
     * ⚠️ **`@Transactional`을 "안 붙이는" 것으로는 트랜잭션이 안 끊긴다.** 클래스 레벨
     * `@Transactional(readOnly = true)`가 이 메서드에도 걸리고, `@Scheduled`는 프록시를 거쳐
     * 호출되므로 그대로 적용된다. 그 결과 두 가지가 동시에 깨져 있었다:
     *   1) 커버 실물 삭제가 DB 커밋 **전에** 실행 — 롤백되면 "DB엔 있는데 파일이 없는" 최악 (K-4 위반)
     *   2) 하위 벌크 DELETE가 readOnly 트랜잭션에 참여 — PostgreSQL이 `25006`으로 거부해
     *      **운영에서 이 배치가 매일 아무 일도 안 하고 조용히 실패**했다 (H2는 관대해 테스트로 안 잡혔다)
     *
     * NEVER를 쓰는 이유 — 바깥 트랜잭션이 생기는 순간 예외로 터져 회귀가 즉시 드러난다.
     * NOT_SUPPORTED는 조용히 보류만 해서 같은 실수가 다시 숨는다
     */
    @Transactional(propagation = Propagation.NEVER)
    @Scheduled(cron = "${app.withdrawal.purge-cron}")
    public void purgeExpired() {
        MemberPurgeService.PurgeResult result =
                memberPurgeService.purgeExpired(LocalDateTime.now().minus(GRACE_PERIOD));

        // DB 커밋이 끝난 뒤 커버 실물을 지운다 (K-4와 같은 순서).
        // delete는 실패를 삼키고 로그만 남긴다 — 최악이 고아 파일이고 그건 감수한다
        result.coverStorageKeys().forEach(fileStorage::delete);
    }

    private Member findMember(Long memberId) {
        return memberRepository.findById(memberId)
                .orElseThrow(() -> new NotFoundException("회원을 찾을 수 없습니다. id=" + memberId));
    }
}
