import { useEffect, useState } from 'react';

import { assetApi } from '../../../api/asset';
import { assetToMentionCandidate, type MentionCandidate } from '../../../generation/prompt-mentions';

export function useQuickMentionCandidates(): MentionCandidate[] {
  const [candidates, setCandidates] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    let cancelled = false;
    assetApi
      .list({ limit: 80 })
      .then((assets) => {
        if (!cancelled) setCandidates(assets.map(assetToMentionCandidate));
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return candidates;
}
