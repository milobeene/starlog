export default function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
      <p className="text-sm font-medium text-white/60">{title}</p>
      {hint && <p className="text-xs text-white/30">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
