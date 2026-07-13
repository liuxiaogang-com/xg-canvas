import { useEffect, useRef, useState } from 'react';
import type { ModelInputContract } from '@xgcanvas/shared-types';

import { modelApi, type CostEstimate, type ParamSpec, type RichModelSummary } from '../../api/model';

/** Load the model list for a task type + the selected model's param schema. */
export function useInlineModel(taskType: string, modelId: string | null) {
  const [models, setModels] = useState<RichModelSummary[]>([]);
  const [specs, setSpecs] = useState<ParamSpec[]>([]);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [inputContract, setInputContract] = useState<ModelInputContract | undefined>();

  useEffect(() => {
    if (!taskType) return;
    let cancel = false;
    modelApi
      .list(taskType)
      .then((r) => !cancel && setModels(r))
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [taskType]);

  useEffect(() => {
    if (!modelId) {
      setSpecs([]);
      setDefaults({});
      setInputContract(undefined);
      return;
    }
    let cancel = false;
    modelApi
      .schema(modelId)
      .then((s) => {
        if (cancel) return;
        setSpecs(s.params);
        setDefaults(s.defaults);
        setInputContract(s.input_contract);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [modelId]);

  return { models, specs, defaults, inputContract };
}

/** Debounced live credit-cost estimate for the selected model + params. */
export function useCostEstimate(
  modelId: string | null,
  params: Record<string, unknown>,
  enabled: boolean,
): CostEstimate | null {
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled || !modelId) {
      setCost(null);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      modelApi
        .estimateCost(modelId, params)
        .then(setCost)
        .catch(() => undefined);
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, key, enabled]);

  return cost;
}
