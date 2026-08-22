package com.milobeene.gamebacklog.admin.dto;

import com.milobeene.gamebacklog.common.dto.MoneyRequest;
import jakarta.validation.Valid;

import java.time.LocalDate;
import java.util.List;

/**
 * 마스터 정보 수정 (FR-ADM-01). **전체 교체**다 — 안 보낸 필드는 비워진다.
 *
 * 게임명은 여기 없다. 이름 변경은 담긴 항목의 `displayName`을 전부 갱신해야 해서
 * 전파 경로가 다르고, 실수로 통째 교체될 때의 피해도 커서 별도 엔드포인트로 뒀다.
 */
public record MasterInfoUpdateRequest(
        List<String> developers,
        List<String> publishers,
        List<String> genres,
        LocalDate releasedOn,
        @Valid MoneyRequest listPrice) {
}
