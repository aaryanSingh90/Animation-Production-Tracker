export default function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-56 animate-pulse rounded-xl bg-slate-200" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl bg-slate-200" />
    </div>
  );
}
