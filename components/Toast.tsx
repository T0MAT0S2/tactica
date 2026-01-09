import React, { useEffect, useState } from 'react';
import { ToastData } from '../types';

let toastId = 0;
let addToastHandler: ((msg: string, type: 'info' | 'success' | 'error') => void) | null = null;

export const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  if (addToastHandler) addToastHandler(message, type);
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    addToastHandler = (message, type) => {
      const id = toastId++;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
    };
    return () => { addToastHandler = null; };
  }, []);

  return (
    <div className="fixed top-5 right-5 z-[100] space-y-2 pointer-events-none">
      {toasts.map(toast => (
        <div key={toast.id} className={`p-4 rounded-lg shadow-lg text-white pointer-events-auto transform transition-all duration-300 ${
          toast.type === 'info' ? 'bg-blue-600' :
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } animate-slide-in`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
};