import { useEffect, useRef, useState } from 'react';
import type { ModelInputContract, TaskType } from '@xgcanvas/shared-types';

import { modelIdentityDependency } from '../../api/model-identity';
import { modelApi, type CostEstimate, type ParamSpec, type RichModelSummary } from '../../api/model';

/** Load the model list for a task type + the selected model's param schema. */
export function useInlineModel(taskType: TaskType | '', modelId: string | null) {
  const [models, setModels] = useState<RichModelSummary[]>([]);
  const [modelsTaskType, setModelsTaskType] = useState<TaskType | ''>('');
  const [specs, setSpecs] = useState<ParamSpec[]>([]);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [inputContract, setInputContract] = useState<ModelInputContract | undefined>();
  const activeModels = modelsTaskType === taskType ? models : [];
  const selectedModel = activeModels.find((model) => model.model_id === modelId) ?? null;
  const schemaSelection = selectedModel;
  const schemaDependency = schemaSelection ? modelIdentityDependency(schemaSelection) : '';

  useEffect(() => {
    setModels([]);
    setModelsTaskType('');
    if (!taskType) return;
    let cancel = false;
    modelApi
      .list(taskType)
      .then((r) => {
        if (cancel) return;
        setModels(r);
        setModelsTaskType(taskType);
      })
      .catch(() => {
        if (!cancel) {
          setModels([]);
          setModelsTaskType('');
        }
      });
    return () => {
      cancel = true;
    };
  }, [taskType]);

  useEffect(() => {
    if (!schemaSelection) {
      setSpecs([]);
      setDefaults({});
      setInputContract(undefined);
      return;
    }
    let cancel = false;
    setSpecs([]);
    setDefaults({});
    setInputContract(undefined);
    modelApi
      .schema(schemaSelection)
      .then((s) => {
        if (cancel) return;
        setSpecs(s.params);
        setDefaults(s.defaults);
        setInputContract(s.input_contract);
      })
      .catch(() => {
        if (cancel) return;
        setSpecs([]);
        setDefaults({});
        setInputContract(undefined);
      });
    return () => {
      cancel = true;
    };
  }, [schemaDependency]);

  return { models: activeModels, selectedModel, specs, defaults, inputContract };
}

/** Debounced live monetary estimate for the selected model + params. */
export function useCostEstimate(
  modelId: string | null,
  params: Record<string, unknown>,
  enabled: boolean,
  modelIdentity?: RichModelSummary | null,
): CostEstimate | null {
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const key = JSON.stringify(params);
  const identityKey = modelIdentity ? modelIdentityDependency(modelIdentity) : '';

  useEffect(() => {
    if (!enabled || !modelId) {
      setCost(null);
      return;
    }
    let cancelled = false;
    setCost(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      modelApi
        .estimateCost(modelId, params)
        .then((estimate) => {
          if (!cancelled) setCost(estimate);
        })
        .catch(() => {
          if (!cancelled) setCost(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, identityKey, key, enabled]);

  return cost;
}
