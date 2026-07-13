import { useEffect, useState } from 'react';

import { modelApi, providerApi } from '../../api';
import type { ModelDefinition, Provider } from '../../types';

/** Load the two lists the wizard needs (providers + all model definitions) once
 *  per open. The caller derives per-provider preset models from `models`. */
export function useWizardData(open: boolean): {
  providers: Provider[];
  models: ModelDefinition[];
  loading: boolean;
} {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    Promise.all([providerApi.list(), modelApi.list(true)])
      .then(([ps, ms]) => {
        if (!alive) return;
        setProviders(ps);
        setModels(ms);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  return { providers, models, loading };
}
