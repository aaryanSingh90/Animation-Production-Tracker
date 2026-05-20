export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-12 text-center">
      <div className="mb-2 text-lg font-semibold text-slate-800">{title}</div>
      <p className="mx-auto max-w-xl text-sm text-slate-500">{description}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
