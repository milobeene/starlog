"use client";

export default function SearchInput({
  value,
  onChange,
  placeholder = "Search games...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative flex-1 md:max-w-md">
      <svg
        className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-white/40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        /*
         * type=search면 크롬이 제 지우기 버튼(::-webkit-search-cancel-button)을 그린다.
         * 그건 브라우저 색이라 어두운 화면에서 혼자 튄다 — 죽이고 아래에서 직접 그린다.
         * type을 text로 바꾸지 않는 이유: Esc로 비우기와 검색 시맨틱은 그대로 쓰고 싶다
         */
        className="w-full rounded-md border border-white/10 bg-white/5 py-2 pr-9 pl-10 text-sm text-white transition-colors placeholder:text-white/30 focus:border-white/30 focus:bg-white/10 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
      />

      {/* Combobox의 지우기 버튼과 같은 모양·같은 무채색으로 맞춘다 */}
      {value && (
        <button
          type="button"
          aria-label="지우기"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-2.5 -translate-y-1/2 text-white/30 transition-colors hover:text-white/80"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
