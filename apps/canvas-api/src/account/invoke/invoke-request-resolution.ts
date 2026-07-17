import {
  AdapterError,
  type UnifiedRequest,
} from '@xgcanvas/adapters-contract';
import { ERROR_CODES, type TaskType } from '@xgcanvas/shared-types';

import { RegistryService } from '../registry';
import type { ModelRegistryEntry, RegistrySnapshot } from '../registry/types';
import type { ChannelModelSelection } from './channel-resolver.service';
import type { InvokeRequestDto } from './dto/invoke-request.dto';
import { normalizeInputsForContract, validateInputContract } from './input-contract.validator';
import { summarizeRequest, type InvokeLogDimensions } from './invoke-log-context';

export interface ResolvedInvokeRequest {
  unified: UnifiedRequest;
  entry: ModelRegistryEntry;
  historical: boolean;
}

/** Resolve and validate the immutable model request before any vendor dispatch. */
export function resolveInvokeRequest(
  registry: RegistryService,
  dto: InvokeRequestDto,
  dims: InvokeLogDimensions,
  snapshot: RegistrySnapshot,
): ResolvedInvokeRequest {
  const pin = dto.resolution.kind === 'pinned' ? dto.resolution.pin : null;
  const entry = pin
    ? registry.requirePinnedEntry(pin, snapshot)
    : registry.requireEntry(dto.model_id, snapshot);
  if (
    (pin && entry.manifest.id !== dto.model_id) ||
    !entry.manifest.task_types.includes(dto.task_type as TaskType)
  ) {
    throw new AdapterError({
      code: ERROR_CODES.MODEL_NOT_FOUND,
      message: `model revision does not match request: ${dto.model_id}`,
      retryable: false,
    });
  }
  if (!pin) registry.resolveEntryTaskPin(entry, dto.task_type);

  dims.provider_slug = entry.manifest.provider_key;
  dims.model_id = entry.manifest.id;
  dims.adapter_key = entry.manifest.adapter_key;
  const logPin = pin ?? entry.pin;
  dims.model_resource_uid = logPin.model_resource_uid;
  dims.model_revision_id = logPin.model_revision_id;
  dims.rate_card_revision_id = logPin.rate_card_revision_id;
  dims.catalog_epoch = logPin.catalog_epoch;

  const inputs = normalizeInputsForContract(
    (dto.inputs ?? {}) as UnifiedRequest['inputs'],
    entry.manifest.input_contract,
  );
  validateInputContract(entry.manifest.input_contract, inputs);

  // prompt/system_prompt values arrive in inputs, while their schema lives beside
  // params. Validation only reads declared properties, so unrelated input keys are
  // ignored and the resulting params remain vendor-safe.
  const validationInput = {
    ...(inputs as Record<string, unknown>),
    ...(dto.params ?? {}),
  };
  const validation = entry.validate(validationInput);
  if (!validation.valid) {
    throw new AdapterError({
      code: ERROR_CODES.CONSTRAINT_VIOLATION,
      message: validation.errors.map((error) => `${error.field}: ${error.message}`).join('; '),
      retryable: false,
    });
  }

  const unified: UnifiedRequest = {
    task_type: dto.task_type as TaskType,
    model_id: entry.manifest.id,
    provider_model: entry.manifest.provider_model,
    params: validation.resolved_params,
    inputs,
    stream: dto.stream,
    idempotency_key: dto.idempotency_key,
  };
  dims.request_summary = summarizeRequest(unified);
  dims.request_body = unified.inputs.messages ?? {
    prompt: unified.inputs.prompt ?? (unified.params as Record<string, unknown>).prompt,
    system_prompt: unified.inputs.system_prompt,
  };
  return { unified, entry, historical: pin !== null };
}

export function toChannelModelSelection(
  entry: ModelRegistryEntry,
  historical: boolean,
): ChannelModelSelection {
  return {
    model_id: entry.manifest.id,
    model_resource_uid: entry.pin.model_resource_uid,
    model_revision_id: entry.pin.model_revision_id,
    provider_resource_uid: entry.provider_resource_uid,
    adapter_key: entry.manifest.adapter_key,
    allowed_channel_resource_uids: entry.allowed_channel_resource_uids,
    historical,
  };
}
