import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

const STYLES = {
  success: { icon: CheckCircle, cls: 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200' },
  error:   { icon: XCircle,     cls: 'bg-red-900/90    border-red-700/50    text-red-200' },
  warning: { icon: AlertCircle, cls: 'bg-amber-900/90  border-amber-700/50  text-amber-200' },
};

export default function Toast({ id, message, type = 'success', onClose, duration = 3500 }) {
  const { icon: Icon, cls } = STYLES[type] || STYLES.success;

  // FIX: onClose used to be a new inline function on every parent render,
  // which restarted this timer each time. It's now stable (see useToast).
  useEffect(() => {
    const t = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(t);
  }, [id, onClose, duration]);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm text-sm font-medium max-w-sm animate-fade-in ${cls}`}>
      <Icon size={15} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={() => onClose(id)} className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, remove }) {
  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} id={t.id} message={t.message} type={t.type} onClose={remove} />
      ))}
    </div>
  );
}

let _id = 0;
export function useToast() {
  const [toasts, setToasts] = useState([]);

  // FIX: show/remove were recreated on every render. Components that put
  // them in hook dependencies (ApiKeyManager's load) re-ran their effects on
  // every render — and a failed fetch → toast → re-render → fetch loop never
  // stopped. useCallback makes them stable.
  const show = useCallback((message, type = 'success') => {
    setToasts((p) => [...p, { id: ++_id, message, type }]);
  }, []);
  const remove = useCallback((id) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  return { toasts, show, remove };
}