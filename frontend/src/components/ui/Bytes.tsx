import { bytesParts } from "@/lib/format";
import Unit from "./Unit";

/** 파일 크기 — 숫자는 모노, 단위는 본문 폰트. 서식 규칙은 `bytesParts` 한 곳에 있다 */
export default function Bytes({ bytes }: { bytes: number }) {
  const { value, unit } = bytesParts(bytes);
  return (
    <>
      {value}
      <Unit space>{unit}</Unit>
    </>
  );
}
