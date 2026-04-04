import React, { createContext, useCallback, useContext, useState, useRef } from 'react';

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error: 'bg-red-50 border-red-300 text-red-800',
  info: 'bg-blue-50 border-blue-300 text-blue-800',
};

const ICON_STYLES = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

const ICONS = {
  success: (
    <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor'>
      <path strokeLinecap='round' strokeLinejoin='round' d='M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
    </svg>
  ),
  error: (
    <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor'>
      <path strokeLinecap='round' strokeLinejoin='round' d='M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z' />
    </svg>
  ),
  info: (
    <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor'>
      <path strokeLinecap='round' strokeLinejoin='round' d='M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z' />
    </svg>
  ),
};

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message, type = 'success') => {
      const id = ++toastId;

      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        // Keep only the newest MAX_VISIBLE toasts
        return next.slice(-MAX_VISIBLE);
      });

      timersRef.current[id] = setTimeout(() => removeToast(id), AUTO_DISMISS_MS);

      return id;
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed bottom-right */}
      <div className='fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none'>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-4 py-3 shadow-lg transition-all duration-200 animate-slide-in ${TOAST_STYLES[toast.type] || TOAST_STYLES.info}`}
            role='alert'
          >
            <span className={`mt-0.5 shrink-0 ${ICON_STYLES[toast.type] || ICON_STYLES.info}`}>
              {ICONS[toast.type] || ICONS.info}
            </span>
            <p className='text-sm font-medium leading-5'>{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className='ml-2 shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity'
              aria-label='Dismiss'
            >
              <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
