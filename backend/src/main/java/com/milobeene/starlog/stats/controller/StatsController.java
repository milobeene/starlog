package com.milobeene.starlog.stats.controller;

import com.milobeene.starlog.common.web.LoginMember;
import com.milobeene.starlog.stats.dto.MonthlyCompletions;
import com.milobeene.starlog.stats.dto.GenreDistribution;
import com.milobeene.starlog.stats.dto.MonthlySpending;
import com.milobeene.starlog.stats.dto.PlaytimeStats;
import com.milobeene.starlog.stats.dto.SpendingStats;
import com.milobeene.starlog.stats.service.StatsQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 통계 (L-5, FR-STAT-01~04).
 *
 * **한 엔드포인트로 묶지 않았다.** 화면이 필요한 타일만 부르면 되고,
 * 대시보드 상단의 전체·상태별 수치는 이미 `GET /api/backlog/facets`가 준다 —
 * 여기서 또 세면 같은 숫자를 두 곳에서 관리하게 된다
 */
@RestController
@RequestMapping("/api/stats")
@RequiredArgsConstructor
public class StatsController {

    private final StatsQueryService statsQueryService;

    /** 장르별 분포 (FR-STAT-01). 개인 장르 우선, 없으면 마스터 폴백 (§6.7) */
    @GetMapping("/genres")
    public List<GenreDistribution> genres(@LoginMember Long memberId) {
        return statsQueryService.genreDistribution(memberId);
    }

    /**
     * 월별 완료 추이 (FR-STAT-02). 대시보드 꺾은선용 — 지출 차트와 같은 모양이다.
     * 회차 기준이라 3회차까지 깬 게임은 3으로 센다
     */
    @GetMapping("/completions/monthly")
    public MonthlyCompletions monthlyCompletions(@LoginMember Long memberId) {
        return statsQueryService.monthlyCompletions(memberId);
    }

    /** 총 플레이 시간 + 게임별 순위 (FR-STAT-03) */
    @GetMapping("/playtime")
    public PlaytimeStats playtime(@LoginMember Long memberId,
                                  @RequestParam(defaultValue = "10") int limit) {
        return statsQueryService.playtime(memberId, limit);
    }

    /**
     * 월별 지출 추이 (FR-STAT-07). 대시보드 꺾은선용.
     * 구독료는 날짜가 없어 기간을 월별로 펼친다. 연도별 월평균의 분모는 12개월 고정
     */
    @GetMapping("/spending/monthly")
    public MonthlySpending monthlySpending(@LoginMember Long memberId) {
        return statsQueryService.monthlySpending(memberId);
    }

    /** 지출 2축 (FR-STAT-04, BR-ACQ-01). 통화도 합치지 않는다 */
    @GetMapping("/spending")
    public SpendingStats spending(@LoginMember Long memberId) {
        return statsQueryService.spending(memberId);
    }
}
