import { useCallback, useEffect, useState } from 'react';
import type { ModelInputContract, PromptDocument } from '@xgcanvas/shared-types';

import { modelIdentityDependency } from '../../../api/model-identity';
import { modelApi, type ParamSpec, type RichModelSummary } from '../../../api/model';
import { defaultParamValue, ensureInputMode, isValidParamValue } from '../../../generation/input-contract-ui';
import { buildPromptDocument } from '../../../generation/prompt-mentions';
import type { CommandBarState, GenMode } from '../types';

export function useCommandBarState(initial: GenMode = 'image') {
  const [state, set] = useState<CommandBarState>({
    mode: initial,
    modelId: null,
    selectedModel: null,
    inputMode: null,
    prompt: '',
    references: [],
    params: {},
  });

  // schema for the currently selected model
  const [specs, setSpecs] = useState<ParamSpec[]>([]);
  const [inputContract, setInputContract] = useState<ModelInputContract | undefined>();
  const [schemaReady, setSchemaReady] = useState(false);

  // when model changes, fetch its schema and reset params to defaults
  useEffect(() => {
    const selection = state.selectedModel ?? state.modelId;
    if (!selection) {
      setSpecs([]);
      setInputContract(undefined);
      setSchemaReady(false);
      return;
    }
    let cancelled = false;
    setSchemaReady(false);
    setSpecs([]);
    setInputContract(undefined);
    modelApi
      .schema(selection)
      .then((s) => {
        if (cancelled) return;
        setSpecs(s.params);
        setInputContract(s.input_contract);
        set((prev) => {
          // merge new defaults on top of existing params so user tweaks survive
          // a model switch for keys they already set
          const merged = reconcileParams(s.params, { ...s.defaults, ...prev.params });
          return { ...prev, inputMode: ensureInputMode(s.input_contract, prev.inputMode), params: merged };
        });
        setSchemaReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSpecs([]);
          setInputContract(undefined);
          setSchemaReady(true);
        }
      });
    return () => { cancelled = true; };
  }, [
    state.modelId,
    state.selectedModel ? modelIdentityDependency(state.selectedModel) : '',
  ]);

  const switchMode = useCallback((mode: GenMode) => {
    set((s) => ({
      ...s,
      mode,
      modelId: null,
      selectedModel: null,
      inputMode: null,
      references: [],
      params: {},
    }));
    setSpecs([]);
    setInputContract(undefined);
    setSchemaReady(false);
  }, []);

  const setModel = useCallback((model: RichModelSummary | null) => {
    setSpecs([]);
    setInputContract(undefined);
    setSchemaReady(false);
    set((state) => ({
      ...state,
      modelId: model?.model_id ?? null,
      selectedModel: model,
    }));
  }, []);
  const setInputMode = useCallback((inputMode: string) => set((s) => ({ ...s, inputMode })), []);
  const setPrompt = useCallback((prompt: string, promptDoc?: PromptDocument) =>
    set((s) => ({ ...s, prompt, promptDoc: promptDoc ?? buildPromptDocument(prompt, s.promptDoc?.mentions ?? []) })), []);
  const setParam = useCallback((key: string, value: unknown) =>
    set((s) => ({ ...s, params: { ...s.params, [key]: value } })), []);
  const setReferences = useCallback((refs: CommandBarState['references']) => set((s) => ({ ...s, references: refs })), []);
  const reset = useCallback(() => set((s) => ({ ...s, prompt: '', promptDoc: undefined, references: [] })), []);

  return { state, specs, inputContract, schemaReady, switchMode, setModel, setInputMode, setPrompt, setParam, setReferences, reset };
}

function reconcileParams(specs: ParamSpec[], params: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const spec of specs) {
    const current = params[spec.field];
    if (isValidParamValue(spec, current)) next[spec.field] = current;
    else {
      const fallback = defaultParamValue(spec);
      if (fallback !== undefined) next[spec.field] = fallback;
    }
  }
  return next;
}
