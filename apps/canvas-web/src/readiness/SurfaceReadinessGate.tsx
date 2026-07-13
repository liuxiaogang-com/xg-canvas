import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import { useHasAnySystem } from '../store/permissions';
import {
  READINESS_BY_ID,
  requiredIdsForGenMode,
  requiredIdsForSurface,
  type ReadinessItemId,
  type ReadinessSurface,
} from './catalog';
import { useReadinessStore } from './store';
import './readiness.css';

function surfaceFromPath(pathname: string): ReadinessSurface | null {
  if (pathname.startsWith('/chat')) return 'chat';
  if (/\/projects\/[^/]+\/canvas/.test(pathname)) return 'canvas';
  if (pathname.startsWith('/generate')) return 'generate';
  if (pathname.startsWith('/assets') || /\/projects\/[^/]+\/assets/.test(pathname)) return 'assets';
  return null;
}

/** Non-admin: centered modal when the current surface is missing required capabilities. */
export default function SurfaceReadinessGate() {
  const hasSystem = useHasAnySystem();
  const location = useLocation();
  const genMode = useReadinessStore((s) => s.genMode);
  const load = useReadinessStore((s) => s.load);
  const loaded = useReadinessStore((s) => s.loaded);
  const statusOf = useReadinessStore((s) => s.statusOf);

  useEffect(() => {
    if (!hasSystem) void load();
  }, [hasSystem, load]);

  const missing = useMemo(() => {
    if (hasSystem || !loaded) return [] as ReadinessItemId[];
    const surface = surfaceFromPath(location.pathname);
    if (!surface) return [];
    let required: ReadinessItemId[];
    if (surface === 'generate') {
      required = requiredIdsForGenMode(genMode ?? 'image').filter((id) => {
        const meta = READINESS_BY_ID[id];
        return meta && !meta.planned;
      });
    } else {
      required = requiredIdsForSurface(surface);
    }
    return required.filter((id) => {
      const st = statusOf(id);
      return st !== 'ready' && st !== 'planned';
    });
  }, [hasSystem, loaded, location.pathname, genMode, statusOf]);

  if (hasSystem || missing.length === 0) return null;

  return (
    <div className="rdy-modal" role="dialog" aria-modal="true" aria-labelledby="rdy-modal-title">
      <div className="rdy-modal__card">
        <h2 id="rdy-modal-title">实例尚未完成配置</h2>
        <p>当前功能依赖以下能力，请联系实例管理员在后台完成配置后再使用。</p>
        <ul className="rdy-modal__list">
          {missing.map((id) => {
            const meta = READINESS_BY_ID[id];
            return (
              <li key={id}>
                <strong>{meta?.title ?? id}</strong>
                <span>{meta?.hint ?? ''}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
