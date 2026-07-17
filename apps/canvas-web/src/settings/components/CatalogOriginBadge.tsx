import type { CatalogOrigin } from '@xgcanvas/shared-types';
import { Badge } from './kit';

export function CatalogOriginBadge({
  origin,
  revision = true,
}: {
  origin: CatalogOrigin;
  revision?: boolean;
}) {
  return (
    <span className="set-tags">
      <Badge tone={origin.kind === 'official' ? 'info' : 'accent'}>
        {origin.kind === 'official' ? '官方预置' : '本地自定义'}
      </Badge>
      {revision ? <span className="set-cell__sub">r{origin.revision}</span> : null}
    </span>
  );
}
