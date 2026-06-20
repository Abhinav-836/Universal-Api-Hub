import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

const STYLES = {
  success: { icon: CheckCircle, cls: 'bg-emerald-900/90 border-emerald-700/50 text-emerald-200' },
  error:   { icon: XCircle,     cls: 'bg-red-900/90    border-red-700/50    text-red-200' },
  warning: { icon: AlertCircle, cls: 'bg-amber-900/90  border-amber-700/50  text-amber-200' },
};

export default function Toast({ message, type = 'success', onClose, duration = 3500 }) {
  const { icon: Icon, cls } = STYLES[type] || STYLES.success;

  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [onClose, duration]);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm text-sm font-medium max-w-sm animate-fade-in ${cls}`}>
      <Icon size={15} className="shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity">
        <X size={14} />
      </button>
    </div>
  );
}

// Toast container + hook
export function ToastContainer({ toasts, remove }) {
  return (
    <div className="fixed top-20 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => remove(t.id)} />
      ))}
    </div>
  );
}

let _id = 0;
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const show   = (message, type = 'success') => setToasts((p) => [...p, { id: ++_id, message, type }]);
  const remove = (id)                         => setToasts((p) => p.filter((t) => t.id !== id));
  return { toasts, show, remove };
}
