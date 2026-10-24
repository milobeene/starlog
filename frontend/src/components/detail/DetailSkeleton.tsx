import { Skeleton } from "@/components/ui/Skeleton";

export default function DetailSkeleton() {
  return (
    <main className="page-x page-top h-full overflow-y-auto">
      <div className="mb-10 flex gap-8">
        <Skeleton className="aspect-[3/4] w-48 shrink-0" />
        <div className="flex-1 pt-16">
          <Skeleton className="mb-3 h-6 w-40" />
          <Skeleton className="mb-3 h-12 w-2/3" />
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
      <Skeleton className="mb-10 h-24 w-full" />
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <Skeleton className="h-64 lg:col-span-2" />
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}
