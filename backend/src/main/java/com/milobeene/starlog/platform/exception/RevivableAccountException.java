package com.milobeene.starlog.platform.exception;

import com.milobeene.starlog.common.exception.RevivableException;

/** 삭제된 플랫폼 계정이 이미 있다 (§6.5, §7.4). 확인 후 PlatformAccountService.revive()로 */
public class RevivableAccountException extends RevivableException {

    public RevivableAccountException(Long accountId) {
        super("삭제된 플랫폼 계정이 있습니다. 복원하시겠습니까? id=" + accountId, accountId);
    }

    public Long getAccountId() {
        return getTargetId();
    }

}
