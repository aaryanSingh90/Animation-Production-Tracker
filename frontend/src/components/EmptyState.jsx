export default function EmptyState({ title, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
      <div className="mb-2 text-lg font-semibold text-slate-800">{title}</div>
      <p className="mx-auto max-w-xl text-sm text-slate-500">{description}</p>
    </div>
  );
}
