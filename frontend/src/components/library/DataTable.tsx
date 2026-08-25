/** 회차·구매 기록 공용 표 */
export default function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-xs tracking-wider text-white/40 uppercase">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">{children}</tbody>
        </table>
      </div>
      {empty && <div className="px-4 py-6 text-center text-xs text-white/30">{empty}</div>}
    </div>
  );
}
