package com.milobeene.gamebacklog.platform.exception;

import com.milobeene.gamebacklog.common.exception.RevivableException;

/** 삭제된 플랫폼 계정이 이미 있다 (§6.5, §7.4). 확인 후 PlatformAccountService.revive()로 */
public class RevivableAccountException extends RevivableException {

    public RevivableAccountException(Long accountId) {
        super("삭제된 플랫폼 계정이 있습니다. 복원 여부를 확인하세요. id=" + accountId, accountId);
    }

    public Long getAccountId() {
        return getTargetId();
    }
}
