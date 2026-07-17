import { ConflictException } from '@nestjs/common';

export function assertCredentialContract(
  authMethod: string,
  credentialType: string,
  payload: Record<string, unknown>,
): void {
  if (authMethod === 'api_key') {
    const keys = Object.keys(payload);
    if (
      credentialType !== 'api_key' ||
      keys.length !== 1 ||
      keys[0] !== 'api_key' ||
      typeof payload.api_key !== 'string' ||
      !payload.api_key.trim()
    ) {
      throw new ConflictException(
        'api_key Provider requires credential_type api_key and exactly one non-empty api_key field',
      );
    }
    return;
  }
  if (authMethod === 'cli_login') {
    if (credentialType !== 'cli_session' || Object.keys(payload).length > 0) {
      throw new ConflictException(
        'cli_login Provider requires an empty cli_session credential marker',
      );
    }
    return;
  }
  throw new ConflictException(`credential management does not support auth_method ${authMethod}`);
}
