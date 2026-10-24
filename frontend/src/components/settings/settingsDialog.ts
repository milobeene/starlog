import type {
  MemberDevice,
  MemberEmulator,
  MemberInputMethod,
  MemberPlatform,
  PlatformAccountRef,
  Subscription,
} from "@/lib/types";

export type SettingsDialog =
  | null
  | { kind: "profile" }
  | { kind: "memo" }
  | { kind: "platform"; edit?: MemberPlatform }
  | { kind: "account"; edit?: PlatformAccountRef }
  | { kind: "device"; edit?: MemberDevice }
  | { kind: "emulator"; edit?: MemberEmulator }
  | { kind: "inputMethod"; edit?: MemberInputMethod }
  | { kind: "subscription"; edit?: Subscription };
