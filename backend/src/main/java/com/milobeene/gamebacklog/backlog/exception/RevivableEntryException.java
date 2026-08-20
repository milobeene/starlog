package com.milobeene.gamebacklog.backlog.exception;

import com.milobeene.gamebacklog.common.exception.RevivableException;

/** 삭제된 백로그 항목이 이미 있다 (§7.4). 확인 후 BacklogService.revive()로 */
public class RevivableEntryException extends RevivableException {

    public RevivableEntryException(Long entryId) {
        super("삭제된 항목이 있습니다. 복원하시겠습니까? id=" + entryId, entryId);
    }

    public Long getEntryId() {
        return getTargetId();
    }

    @Override
    public String reviveUrl() {
        return "/api/backlog/" + getTargetId() + "/revive";
    }
}
