import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Repository } from 'typeorm';

import { EncryptionService } from '../credential/encryption.service';
import type { UpdateObjectStorageDto } from './object-storage.dto';
import { SystemSetting } from './system-setting.entity';

const SETTING_KEY = 'object_storage';

interface PublicSettings {
  endpoint: string;
  port?: number;
  use_ssl: boolean;
  force_path_style: boolean;
  region: string;
  bucket: string;
  browser_s3_endpoint?: string;
  verified_at?: string | null;
}

interface SecretSettings {
  access_key: string;
  secret_key: string;
}

interface RuntimeStorage {
  settings: PublicSettings;
  client: S3Client;
  publicClient: S3Client;
}

@Injectable()
export class ObjectStorageClient {
  private runtime: RuntimeStorage | null = null;

  constructor(
    @InjectRepository(SystemSetting) private readonly repo: Repository<SystemSetting>,
    private readonly encryption: EncryptionService,
  ) {}

  async getSettingsView() {
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    const config = normaliseStored((row?.public_config ?? {}) as Record<string, unknown>);
    const configured = !!row?.encrypted_payload && !!config.endpoint && !!config.bucket;
    return {
      configured,
      verified: configured && !!config.verified_at,
      verified_at: config.verified_at ?? null,
      ...config,
      // Rolling-upgrade compatibility; new clients use browser_s3_endpoint.
      public_host: config.browser_s3_endpoint,
      has_access_key: !!row?.encrypted_payload,
      has_secret_key: !!row?.encrypted_payload,
    };
  }

  async readinessStatus(): Promise<'ready' | 'missing' | 'unverified'> {
    const view = await this.getSettingsView();
    if (!view.configured) return 'missing';
    return view.verified ? 'ready' : 'unverified';
  }

  async updateSettings(dto: UpdateObjectStorageDto) {
    const candidate = await this.resolveCandidate(dto, null);
    return this.persistResolved(candidate.publicConfig, candidate.secrets);
  }

  async testSettings(dto: UpdateObjectStorageDto) {
    const { publicConfig, secrets } = await this.resolveCandidate(dto, null);
    const runtime = buildRuntime(publicConfig, secrets);
    const probeKey = `xgcanvas/_system/probes/${randomUUID()}`;
    const probe = Buffer.from('xgcanvas-storage-probe', 'utf8');
    let uploaded = false;
    try {
      await runtime.client.send(new PutObjectCommand({
        Bucket: runtime.settings.bucket,
        Key: probeKey,
        Body: probe,
        ContentLength: probe.byteLength,
        ContentType: 'application/octet-stream',
      }));
      uploaded = true;
      const head = await runtime.client.send(new HeadObjectCommand({ Bucket: runtime.settings.bucket, Key: probeKey }));
      if (head.ContentLength !== probe.byteLength) {
        throw new ServiceUnavailableException('Object storage probe returned an unexpected size');
      }
    } finally {
      if (uploaded) {
        await runtime.client.send(new DeleteObjectCommand({ Bucket: runtime.settings.bucket, Key: probeKey }));
      }
    }
    return this.persistResolved({ ...publicConfig, verified_at: new Date().toISOString() }, secrets);
  }

  async bucket(): Promise<string> {
    return (await this.getRuntime()).settings.bucket;
  }

  async putObject(input: PutObjectCommandInput): Promise<void> {
    const runtime = await this.getRuntime();
    await runtime.client.send(new PutObjectCommand(input));
  }

  /** Verify an object really exists (e.g. after a presigned direct upload). */
  async headObject(storageKey: string): Promise<{ size_bytes: number; mime_type?: string; etag?: string } | null> {
    const runtime = await this.getRuntime();
    try {
      const res = await runtime.client.send(
        new HeadObjectCommand({ Bucket: runtime.settings.bucket, Key: storageKey }),
      );
      return {
        size_bytes: res.ContentLength ?? 0,
        mime_type: res.ContentType ?? undefined,
        etag: res.ETag ?? undefined,
      };
    } catch (error) {
      if (!isObjectNotFound(error)) throw error;
      return null;
    }
  }

  async getObjectUrl(storageKey: string, ttlSec: number): Promise<string> {
    const runtime = await this.getRuntime();
    return getSignedUrl(
      runtime.publicClient,
      new GetObjectCommand({ Bucket: runtime.settings.bucket, Key: storageKey }),
      { expiresIn: ttlSec },
    );
  }

  async deleteObject(storageKey: string): Promise<void> {
    const runtime = await this.getRuntime();
    await runtime.client.send(
      new DeleteObjectCommand({ Bucket: runtime.settings.bucket, Key: storageKey }),
    );
  }

  async copyObject(sourceKey: string, destinationKey: string, sourceEtag: string): Promise<void> {
    const runtime = await this.getRuntime();
    await runtime.client.send(new CopyObjectCommand({
      Bucket: runtime.settings.bucket,
      Key: destinationKey,
      CopySource: `${runtime.settings.bucket}/${sourceKey}`,
      CopySourceIfMatch: sourceEtag,
      MetadataDirective: 'COPY',
    }));
  }

  /**
   * Runtime trust check for adapters that must dereference a signed asset URL.
   * The expected host/path shape is derived from the active S3 client instead
   * of trusting caller-provided metadata or maintaining an SSRF blacklist.
   */
  async isTrustedPresignedReadUrl(value: string): Promise<boolean> {
    const probeKey = '__xgcanvas_read_origin_probe__';
    try {
      const candidate = new URL(value);
      const probe = new URL(await this.getObjectUrl(probeKey, 60));
      const keyIndex = probe.pathname.lastIndexOf(probeKey);
      const pathPrefix = keyIndex >= 0 ? probe.pathname.slice(0, keyIndex) : '/';
      return (
        candidate.origin === probe.origin &&
        candidate.pathname.startsWith(pathPrefix) &&
        candidate.searchParams.has('X-Amz-Signature')
      );
    } catch {
      return false;
    }
  }

  async putObjectUrl(storageKey: string, ttlSec: number, contentType?: string): Promise<string> {
    const runtime = await this.getRuntime();
    return getSignedUrl(
      runtime.publicClient,
      new PutObjectCommand({
        Bucket: runtime.settings.bucket,
        Key: storageKey,
        ...(contentType ? { ContentType: contentType } : {}),
      }),
      {
        expiresIn: ttlSec,
        ...(contentType ? { signableHeaders: new Set(['content-type']) } : {}),
      },
    );
  }

  private async getRuntime(): Promise<RuntimeStorage> {
    if (this.runtime) return this.runtime;
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    if (!row?.encrypted_payload) {
      throw new ServiceUnavailableException('Object storage is not configured. Configure it in Settings first.');
    }
    const secrets = (await this.encryption.decrypt(row.encrypted_payload)) as unknown as SecretSettings;
    this.runtime = buildRuntime(normaliseStored(row.public_config as Record<string, unknown>), secrets);
    return this.runtime;
  }

  private async persistResolved(publicConfig: PublicSettings, secrets: SecretSettings) {
    const encrypted = await this.encryption.encrypt(secrets);
    await this.repo.save(this.repo.create({
      key: SETTING_KEY,
      public_config: { ...publicConfig },
      encrypted_payload: encrypted.encrypted,
      encryption_key_id: encrypted.keyId,
    }));
    this.runtime = buildRuntime(publicConfig, secrets);
    return this.getSettingsView();
  }

  private async resolveCandidate(dto: UpdateObjectStorageDto, verifiedAt: string | null) {
    const previous = await this.readSecrets();
    const secrets = {
      access_key: dto.access_key?.trim() || previous?.access_key || '',
      secret_key: dto.secret_key?.trim() || previous?.secret_key || '',
    };
    if (!secrets.access_key || !secrets.secret_key) {
      throw new BadRequestException('access_key and secret_key are required for initial setup');
    }
    return { publicConfig: normalisePublic(dto, verifiedAt), secrets };
  }

  private async readSecrets(): Promise<SecretSettings | null> {
    const row = await this.repo.findOne({ where: { key: SETTING_KEY } });
    if (!row?.encrypted_payload) return null;
    return (await this.encryption.decrypt(row.encrypted_payload)) as unknown as SecretSettings;
  }
}

function normalisePublic(dto: UpdateObjectStorageDto, verifiedAt: string | null): PublicSettings {
  const endpoint = dto.endpoint.trim().replace(/\/$/, '');
  const bucket = dto.bucket.trim();
  if (!endpoint || !bucket) throw validationError('endpoint and bucket must not be blank');
  endpointUrl(endpoint, dto.port, dto.use_ssl ?? true);
  const browserEndpoint = selectBrowserEndpoint(dto);
  if (dto.browser_s3_endpoint && !dto.browser_s3_endpoint.includes('://')) {
    throw validationError('browser_s3_endpoint must be an absolute http(s) URL');
  }
  if (browserEndpoint) endpointUrl(browserEndpoint, undefined, true);
  return {
    endpoint,
    port: dto.port,
    use_ssl: dto.use_ssl ?? true,
    force_path_style: dto.force_path_style ?? true,
    region: dto.region?.trim() || 'us-east-1',
    bucket,
    browser_s3_endpoint: browserEndpoint,
    verified_at: verifiedAt,
  };
}

function normaliseStored(raw: Record<string, unknown>): PublicSettings {
  const endpoint = typeof raw.endpoint === 'string' ? raw.endpoint : '';
  const browserEndpointRaw = typeof raw.browser_s3_endpoint === 'string'
    ? raw.browser_s3_endpoint
    : typeof raw.browser_endpoint === 'string'
      ? raw.browser_endpoint
    : typeof raw.public_host === 'string' ? raw.public_host : undefined;
  const browserEndpoint = browserEndpointRaw
    ? endpointUrl(browserEndpointRaw, undefined, true)
    : undefined;
  return {
    endpoint,
    port: typeof raw.port === 'number' ? raw.port : undefined,
    use_ssl: typeof raw.use_ssl === 'boolean' ? raw.use_ssl : true,
    force_path_style: typeof raw.force_path_style === 'boolean' ? raw.force_path_style : true,
    region: typeof raw.region === 'string' ? raw.region : 'us-east-1',
    bucket: typeof raw.bucket === 'string' ? raw.bucket : '',
    browser_s3_endpoint: browserEndpoint,
    verified_at: typeof raw.verified_at === 'string' ? raw.verified_at : null,
  };
}

function buildRuntime(settings: PublicSettings, secrets: SecretSettings): RuntimeStorage {
  const common = {
    region: settings.region,
    credentials: { accessKeyId: secrets.access_key, secretAccessKey: secrets.secret_key },
    forcePathStyle: settings.force_path_style,
    // Browser direct-upload PUTs must not carry flexible checksum query/headers —
    // those trigger CORS preflight failures on R2/S3 unless every checksum header
    // is allowlisted. Server-side PutObject still computes checksums when required.
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
  };
  return {
    settings,
    client: new S3Client({ ...common, endpoint: endpointUrl(settings.endpoint, settings.port, settings.use_ssl) }),
    publicClient: new S3Client({
      ...common,
      endpoint: settings.browser_s3_endpoint
        ? endpointUrl(settings.browser_s3_endpoint, undefined, true)
        : endpointUrl(settings.endpoint, settings.port, settings.use_ssl),
    }),
  };
}

function isObjectNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { $metadata?: { httpStatusCode?: number } };
  return value.$metadata?.httpStatusCode === 404;
}

function endpointUrl(raw: string, port: number | undefined, useSsl: boolean): string {
  try {
    const value = raw.includes('://') ? raw : `${useSsl ? 'https' : 'http'}://${raw}`;
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported scheme');
    if (url.username || url.password || url.search || url.hash) throw new Error('credentials, query and fragment are forbidden');
    if (!url.hostname) throw new Error('hostname is required');
    if (port) {
      if (url.port && url.port !== String(port)) throw new Error('endpoint port conflicts with port');
      url.port = String(port);
    }
    return url.toString().replace(/\/$/, '');
  } catch (error) {
    throw validationError(`invalid object storage endpoint: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function selectBrowserEndpoint(dto: UpdateObjectStorageDto): string | undefined {
  const values = [dto.browser_s3_endpoint, dto.browser_endpoint, dto.public_host]
    .map((value) => value?.trim().replace(/\/$/, ''))
    .filter((value): value is string => !!value);
  if (new Set(values).size > 1) {
    throw validationError('browser_s3_endpoint conflicts with a legacy endpoint alias');
  }
  return values[0];
}

function validationError(message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', message });
}
