import { useApp } from '../store/AppContext';

export function ToastNotifications() {
  const { state } = useApp();

  return (
    <div className="fixed left-1/2 top-0 z-50 flex w-full max-w-[430px] -translate-x-1/2 flex-col items-center gap-2 px-4 pt-safe pointer-events-none">
      {state.toasts.map(toast => (
        <div
          key={toast.id}
          className="animate-toast-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-[20px] border px-4 py-3 shadow-2xl"
          style={{
            background: `linear-gradient(135deg, ${toast.color}22, rgba(12, 16, 28, 0.96))`,
            borderColor: `${toast.color}77`,
            boxShadow: `0 14px 36px ${toast.color}33`,
          }}
        >
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: `${toast.color}22`, border: `1px solid ${toast.color}55` }}
          >
            {toast.icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: toast.color }}>
              {toast.title}
            </p>
            <p className="mt-1 text-sm font-bold leading-5" style={{ color: 'var(--text-primary)' }}>
              {toast.message}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
