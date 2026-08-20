package com.milobeene.gamebacklog.backlog.exception;

import com.milobeene.gamebacklog.common.exception.RevivableException;

/** 삭제된 백로그 항목이 이미 있다 (§7.4). 확인 후 BacklogService.revive()로 */
public class RevivableEntryException extends RevivableException {

    public RevivableEntryException(Long entryId) {
        super("삭제된 항목이 있습니다. 복원 여부를 확인하세요. id=" + entryId, entryId);
    }

    /** 이전 이름 유지 — 호출부가 의미를 알아보기 쉽다 */
    public Long getEntryId() {
        return getTargetId();
    }
}
