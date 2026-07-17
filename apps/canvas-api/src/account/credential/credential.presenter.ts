import type { ModelCredential } from './credential.entity';
import type { CredentialView } from './credential.service';

export function presentCredential(credential: ModelCredential): CredentialView {
  return {
    id: credential.id,
    channel_resource_uid: credential.channel_resource_uid,
    label: credential.label,
    credential_type: credential.credential_type,
    payload_fields: credential.payload_fields,
    enabled: credential.enabled,
    is_valid: credential.is_valid,
    last_validated_at: credential.last_validated_at,
    validation_error: credential.validation_error,
    expires_at: credential.expires_at,
    last_used_at: credential.last_used_at,
    total_usage_count: credential.total_usage_count,
    created_by: credential.created_by,
    created_at: credential.created_at,
    updated_at: credential.updated_at,
  };
}
