import type { AssetRecord } from '../../api/asset';
import AssetCard from './AssetCard';

interface Props {
  assets: AssetRecord[];
  onSelect?(asset: AssetRecord): void;
}

/**
 * Group assets by day. Keeps the time signal without forcing a heavy
 * masonry library at this stage.
 */
export default function AssetGrid({ assets, onSelect }: Props) {
  if (assets.length === 0) return <p className="text-text-3">暂无资产</p>;
  const groups = groupByDay(assets);
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="text-sm text-text-3 mb-3">{g.day}</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {g.items.map((a) => (
              <AssetCard key={a.id} asset={a} onClick={() => onSelect?.(a)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByDay(rows: AssetRecord[]): { day: string; items: AssetRecord[] }[] {
  const map = new Map<string, AssetRecord[]>();
  for (const a of rows) {
    const day = a.created_at.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(a);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, items]) => ({ day, items }));
}
