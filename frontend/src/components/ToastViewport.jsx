import clsx from "clsx";
import { useToastStore } from "../store/toastStore";

export default function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg",
            toast.type === "error" && "bg-red-500",
            toast.type === "success" && "bg-emerald-500",
            toast.type === "info" && "bg-sky-500",
            !["error", "success", "info"].includes(toast.type) && "bg-slate-800"
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
