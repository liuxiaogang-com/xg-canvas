import { useEffect, useState } from 'react';

import { credentialApi } from '../../api';
import type {
  CredentialCatalogChannel,
  CredentialCatalogModel,
  CredentialCatalogProvider,
} from '../../types';

interface WizardData {
  providers: CredentialCatalogProvider[];
  channels: CredentialCatalogChannel[];
  models: CredentialCatalogModel[];
  loading: boolean;
  error: string | null;
}

const EMPTY_DATA = {
  providers: [],
  channels: [],
  models: [],
};

/** Load the credential-scoped Catalog projection; no model-admin permission is required. */
export function useWizardData(open: boolean): WizardData {
  const [data, setData] = useState(EMPTY_DATA as Omit<WizardData, 'loading' | 'error'>);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void credentialApi.catalog()
      .then((view) => {
        if (!alive) return;
        setData({ providers: view.providers, channels: view.channels, models: view.models });
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setData(EMPTY_DATA);
        setError(reason instanceof Error ? reason.message : '加载接入目录失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  return { ...data, loading, error };
}
