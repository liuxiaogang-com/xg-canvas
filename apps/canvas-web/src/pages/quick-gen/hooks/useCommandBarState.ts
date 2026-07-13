import { useCallback, useEffect, useState } from 'react';
import type { ModelInputContract, PromptDocument } from '@xgcanvas/shared-types';

import { modelApi, type ParamSpec } from '../../../api/model';
import { defaultParamValue, ensureInputMode, isValidParamValue } from '../../../generation/input-contract-ui';
import { buildPromptDocument } from '../../../generation/prompt-mentions';
import type { CommandBarState, GenMode } from '../types';

export function useCommandBarState(initial: GenMode = 'image') {
  const [state, set] = useState<CommandBarState>({
    mode: initial,
    modelId: null,
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
    if (!state.modelId) {
      setSpecs([]);
      setInputContract(undefined);
      setSchemaReady(false);
      return;
    }
    let cancelled = false;
    setSchemaReady(false);
    modelApi
      .schema(state.modelId)
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
  }, [state.modelId]);

  const switchMode = useCallback((mode: GenMode) => {
    set((s) => ({ ...s, mode, modelId: null, inputMode: null, references: [], params: {} }));
    setSpecs([]);
    setInputContract(undefined);
  }, []);

  const setModel = useCallback((modelId: string | null) => set((s) => ({ ...s, modelId })), []);
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
  const next = { ...params };
  for (const spec of specs) {
    if (!isValidParamValue(spec, next[spec.field])) {
      const def = defaultParamValue(spec);
      if (def !== undefined) next[spec.field] = def;
    }
  }
  return next;
}
