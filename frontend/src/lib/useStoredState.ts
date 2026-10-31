"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * 마지막 선택을 localStorage에 기억하는 상태. 정적 내보내기라 첫 렌더는 늘 기본값이고(서버 렌더와 같아야 한다),
 * 마운트 뒤에 읽어 온다. 막힌 환경(시크릿 창 등)에서도 화면은 기본값으로 동작한다
 */
export function useStoredState<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(key) as T | null;
        if (raw && allowed.includes(raw)) setValue(raw);
      } catch { /* 못 읽어도 기본값 */ }
    });
    // allowed는 상수 목록이라 의존성에 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((next: T) => {
    setValue(next);
    try { window.localStorage.setItem(key, next); } catch { /* 기억 못 해도 동작한다 */ }
  }, [key]);
  return [value, set];
}
