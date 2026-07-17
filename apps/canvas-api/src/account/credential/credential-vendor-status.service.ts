import { Injectable } from '@nestjs/common';
import { redactSecretText } from '@xgcanvas/model-catalog';
import { readBoundedJson } from '../../common/http/bounded-body';
import { guardedFetch } from '../../common/http/guarded-outbound';
import { DreaminaCliRunner } from '../dreamina/dreamina-cli.runner';

const VENDOR_REQUEST_TIMEOUT_MS = 12_000;
const MAX_VENDOR_MESSAGE_LENGTH = 512;
const MAX_VENDOR_STATUS_BODY_BYTES = 1024 * 1024;

export interface ProviderStatusItem {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger' | 'default';
}

export interface ProviderStatus {
  items: ProviderStatusItem[];
  available?: boolean;
  note?: string;
}

export interface VendorProbeResult {
  ok: boolean;
  status?: number;
  message?: string;
}

@Injectable()
export class CredentialVendorStatusService {
  constructor(private readonly dreamina: DreaminaCliRunner) {}

  async validateDreamina(): Promise<VendorProbeResult> {
    const credit = await this.dreamina.credit();
    return credit.logged_in
      ? { ok: true }
      : { ok: false, message: credit.error ?? 'Dreamina CLI is not logged in' };
  }

  async fetchDreaminaStatus(): Promise<ProviderStatus> {
    const credit = await this.dreamina.credit();
    if (!credit.logged_in) {
      return { items: [], available: false, note: credit.error ?? '即梦 CLI 未登录' };
    }
    const items: ProviderStatusItem[] = [
      {
        label: '会员',
        value: credit.vip_level || '未开通',
        tone: credit.vip_level ? 'success' : 'warning',
      },
    ];
    if (typeof credit.total_credit === 'number') {
      items.push({
        label: '积分',
        value: String(credit.total_credit),
        tone: credit.total_credit > 0 ? 'success' : 'warning',
      });
    }
    return { items, available: !!credit.vip_level && (credit.total_credit ?? 0) > 0 };
  }

  async fetchBalance(base: string, apiKey: string): Promise<ProviderStatus> {
    const url = `${base.replace(/\/$/, '')}/user/balance`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VENDOR_REQUEST_TIMEOUT_MS);
    try {
      const response = await guardedFetch(url, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) return { items: [], note: `不支持余额查询(${response.status})` };
      const body = await readBoundedJson<{
        is_available?: boolean;
        balance_infos?: Array<{ currency?: unknown; total_balance?: unknown }>;
      }>(response, MAX_VENDOR_STATUS_BODY_BYTES);
      const balances = Array.isArray(body.balance_infos) ? body.balance_infos : [];
      return {
        items: balances.flatMap((balance) => {
          if (typeof balance.currency !== 'string' || typeof balance.total_balance !== 'string')
            return [];
          return [
            {
              label: '余额',
              value: `${balance.currency} ${balance.total_balance}`,
              tone: Number(balance.total_balance) > 0 ? ('success' as const) : ('warning' as const),
            },
          ];
        }),
        available: typeof body.is_available === 'boolean' ? body.is_available : undefined,
      };
    } catch (error) {
      return { items: [], note: safeVendorMessage(error, apiKey) };
    } finally {
      clearTimeout(timer);
    }
  }

  async pingModels(base: string, apiKey: string): Promise<VendorProbeResult> {
    const url = `${base.replace(/\/$/, '')}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VENDOR_REQUEST_TIMEOUT_MS);
    try {
      const response = await guardedFetch(url, {
        headers: { authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (response.ok) return { ok: true, status: response.status };
      let message: string | undefined;
      try {
        const body = await readBoundedJson<{
          error?: { message?: unknown };
          message?: unknown;
        }>(response, MAX_VENDOR_STATUS_BODY_BYTES);
        const raw =
          typeof body.error?.message === 'string'
            ? body.error.message
            : typeof body.message === 'string'
              ? body.message
              : undefined;
        message = raw ? safeVendorMessage(raw, apiKey) : undefined;
      } catch {
        // Non-JSON error body.
      }
      return { ok: false, status: response.status, message };
    } catch (error) {
      return { ok: false, message: safeVendorMessage(error, apiKey) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeVendorMessage(error: unknown, secret: string): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return `Vendor request timed out after ${VENDOR_REQUEST_TIMEOUT_MS}ms`;
  }
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return 'Vendor request failed';
  const knownSecretRedacted = secret.length > 0 ? raw.split(secret).join('[REDACTED]') : raw;
  return redactSecretText(knownSecretRedacted).slice(0, MAX_VENDOR_MESSAGE_LENGTH);
}
