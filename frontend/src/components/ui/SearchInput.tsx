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
        className="w-full rounded-md border border-white/10 bg-white/5 py-2 pr-4 pl-10 text-sm text-white transition-colors placeholder:text-white/30 focus:border-white/30 focus:bg-white/10 focus:outline-none"
      />
    </div>
  );
}
