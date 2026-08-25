"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Dropdown from "@/components/ui/Dropdown";
import { logout, useSession } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/library", label: "Library" },
];

/**
 * 배경 없이 글자만 떠 있다 — 유체 배경이 그대로 비쳐야 한다.
 * 그래서 fixed로 띄우고 본문이 그 아래로 흐르게 둔다 (상세 배너가 헤더 뒤까지 덮는다)
 */
export default function AppHeader() {
  const pathname = usePathname();
  const session = useSession();
  const nickname = session.me?.profile.nickname ?? "";

  return (
    <header className="fixed top-0 left-0 z-50 flex h-16 w-full flex-shrink-0 items-center justify-between px-8">
      <div className="flex w-1/3 items-center">
        <Link href="/" className="font-display text-lg font-bold tracking-[0.2em]">
          STARLOG
        </Link>
      </div>

      <nav className="flex w-1/3 items-center justify-center space-x-12 text-sm font-medium tracking-wide">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`uppercase transition-colors ${active ? "text-white" : "text-white/50 hover:text-white"}`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/add"
          className={`flex items-center gap-1 uppercase transition-colors ${
            pathname.startsWith("/add") ? "text-white" : "text-white/50 hover:text-white"
          }`}
        >
          Add <span className="text-lg leading-none">+</span>
        </Link>
      </nav>

      <div className="flex w-1/3 justify-end">
        <Dropdown
          trigger={() => (
            <div className="group flex items-center space-x-2 py-2 text-sm font-medium transition-colors hover:text-white/80">
              <span>{nickname || " "}</span>
              <svg className="h-3 w-3 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        >
          {(close) => (
            <>
              {/* 프로필과 설정이 같은 페이지라 항목을 나누지 않는다 */}
              <Link href="/settings" onClick={close} className="menu-item">
                Profile &amp; Settings
              </Link>
              <div className="my-1 border-t border-white/10" />
              <button
                onClick={() => {
                  close();
                  void logout();
                }}
                className="menu-item !text-red-400 hover:!text-red-300"
              >
                Sign out
              </button>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
