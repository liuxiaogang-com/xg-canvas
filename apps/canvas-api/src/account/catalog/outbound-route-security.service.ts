import { ForbiddenException, Injectable } from '@nestjs/common';
import { outboundUrlOrigin } from '@xgcanvas/model-catalog';
import { In, IsNull, type EntityManager } from 'typeorm';
import { AuthzService } from '../../authz/authz.service';
import { ModelCredential } from '../credential/credential.entity';

export interface CredentialRouteChange {
  channel_resource_uid: string;
  current_base_url?: string;
  next_base_url?: string;
}

@Injectable()
export class OutboundRouteSecurityService {
  constructor(private readonly authz: AuthzService) {}

  async assertCredentialRouteChangeAllowed(
    manager: EntityManager,
    actorUserId: string,
    changes: readonly CredentialRouteChange[],
  ): Promise<void> {
    const changedChannelUids = [
      ...new Set(
        changes
          .filter(
            (change) =>
              outboundUrlOrigin(change.current_base_url) !==
              outboundUrlOrigin(change.next_base_url),
          )
          .map((change) => change.channel_resource_uid),
      ),
    ];
    if (changedChannelUids.length === 0) return;

    const hasActiveCredential = await manager.getRepository(ModelCredential).exists({
      where: {
        channel_resource_uid: In(changedChannelUids),
        enabled: true,
        archived_at: IsNull(),
      },
    });
    if (!hasActiveCredential) return;

    const mayManageCredentials = await this.authz.can(
      actorUserId,
      'system.credential.manage',
      'system',
      null,
    );
    if (mayManageCredentials) return;

    throw new ForbiddenException({
      code: 'CREDENTIAL_ROUTE_CHANGE_FORBIDDEN',
      message:
        'changing the origin of a Channel with an active credential requires credential management permission',
    });
  }
}

export function effectiveOutboundBaseUrl(
  channelBaseUrl: string | undefined,
  channelOverrides: Record<string, unknown>,
  providerBaseUrl: string | undefined,
  providerOverrides: Record<string, unknown>,
): string | undefined {
  return (
    stringValue(channelOverrides.base_url) ??
    channelBaseUrl ??
    stringValue(providerOverrides.base_url) ??
    providerBaseUrl
  );
}

export function nextConfigOverrides(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  clear: readonly string[],
): Record<string, unknown> {
  const next = { ...current, ...patch };
  for (const key of clear) delete next[key];
  return next;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
