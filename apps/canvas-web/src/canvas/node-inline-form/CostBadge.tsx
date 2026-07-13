import type { CostEstimate } from '../../api/model';

/** Live compute-credit estimate. Inline SVG bolt (buerguo ui-003: no emoji). */
export default function CostBadge({ cost }: { cost: CostEstimate | null }) {
  if (!cost) return null;
  return (
    <span className="nif-cost" title={cost.breakdown}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z" />
      </svg>
      {cost.estimated_credits}
    </span>
  );
}
