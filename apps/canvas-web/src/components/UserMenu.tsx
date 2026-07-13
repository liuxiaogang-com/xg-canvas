import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../store/auth';
import './UserMenu.css';

/** Avatar + name with a dropdown (个人中心 / 退出登录). Shared by the canvas
 *  top bar and the app shell header. Theme-aware (uses --glass-* tokens). */
export default function UserMenu() {
  const me = useAuthStore((s) => s.me);
  const logout = useAuthStore((s) => s.logout);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (!me) return null;
  const email = me.email ?? '';
  const name = email.split('@')[0] || '用户';
  const initial = (email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="usermenu" ref={ref}>
      <button
        type="button"
        className="usermenu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="usermenu__avatar">{initial}</span>
        <span className="usermenu__name">{name}</span>
      </button>

      {open ? (
        <div className="usermenu__pop" role="menu">
          <div className="usermenu__head">
            <span className="usermenu__avatar usermenu__avatar--lg">{initial}</span>
            <div className="usermenu__head-meta">
              <div className="usermenu__head-name">{name}</div>
              <div className="usermenu__head-email">{email}</div>
            </div>
          </div>
          <div className="usermenu__sep" />
          <button
            type="button"
            className="usermenu__item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              nav('/account');
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20a8 8 0 0 1 16 0" />
            </svg>
            个人中心
          </button>
          <button
            type="button"
            className="usermenu__item usermenu__item--danger"
            role="menuitem"
            onClick={async () => {
              setOpen(false);
              await logout();
              nav('/auth');
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            退出登录
          </button>
        </div>
      ) : null}
    </div>
  );
}
