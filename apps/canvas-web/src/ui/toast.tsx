import { useEffect, useState } from 'react';

type Kind = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
}

let push: ((item: Omit<ToastItem, 'id'>) => void) | null = null;
let counter = 0;

export const toast = {
  success: (text: string) => push?.({ kind: 'success', text }),
  error: (text: string) => push?.({ kind: 'error', text }),
  warning: (text: string) => push?.({ kind: 'warning', text }),
  info: (text: string) => push?.({ kind: 'info', text }),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    push = (item) => {
      const id = ++counter;
      setItems((cur) => [...cur, { id, ...item }]);
      setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 3200);
    };
    return () => {
      push = null;
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="toaster">
      {items.map((i) => (
        <div key={i.id} className={`toast toast--${i.kind}`}>
          {i.text}
        </div>
      ))}
    </div>
  );
}
