"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 옛 주소 — 스크린샷 화면으로 합쳐졌다 */
export default function ScreenshotsInboxRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/screenshots"); }, [router]);
  return null;
}
