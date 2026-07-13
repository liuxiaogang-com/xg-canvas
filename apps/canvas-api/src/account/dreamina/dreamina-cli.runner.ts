import { spawn } from 'node:child_process';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Thin wrapper around the local `dreamina` binary (即梦 official CLI, v1.4.x).
 * The CLI uses OAuth Device Flow, so canvas-api spawns it directly. Set
 * DREAMINA_CLI_PATH to the binary; login state is persisted by the CLI itself
 * in its home dir (mount a volume in container deployments).
 *
 * Output parsing is intentionally defensive: the CLI mixes text (login) and
 * JSON (credit/generation), and uses exit code 1 for benign states (e.g. a
 * logged-in but non-VIP account), so success is judged by content, not code.
 */

export interface DeviceFlowStart {
  verification_uri: string;
  user_code: string;
  device_code: string;
  expires_at: string | null;
}

export type LoginState = 'pending' | 'success' | 'no_permission' | 'expired' | 'failed';
export interface LoginResult {
  state: LoginState;
  user_id?: string;
  message?: string;
}

export interface CreditInfo {
  logged_in: boolean;
  total_credit?: number;
  user_id?: string;
  user_name?: string;
  vip_level?: string; // '' / undefined = non-VIP (generation not allowed)
  error?: string;
}

export interface SubmitResult {
  submit_id: string;
  gen_status: 'querying' | 'success' | 'fail';
  fail_reason?: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  videos: Array<{ url: string; width?: number; height?: number }>;
}

interface RunOut {
  stdout: string;
  stderr: string;
  code: number | null;
}

interface RawResult {
  submit_id?: string;
  gen_status?: string;
  fail_reason?: string;
  result_json?: {
    images?: Array<{ image_url?: string; width?: number; height?: number }>;
    videos?: Array<{ video_url?: string; width?: number; height?: number }>;
  };
}

@Injectable()
export class DreaminaCliRunner {
  private readonly logger = new Logger(DreaminaCliRunner.name);
  private readonly cliPath: string;

  constructor(config: ConfigService) {
    this.cliPath = config.get<string>('DREAMINA_CLI_PATH', 'dreamina');
  }

  /** Spawn the binary; never rejects on non-zero exit (benign states use it). */
  private run(args: string[], timeoutMs = 30000, signal?: AbortSignal): Promise<RunOut> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.cliPath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`dreamina ${args[0] ?? ''} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      const onAbort = () => child.kill();
      signal?.addEventListener('abort', onAbort, { once: true });
      const done = (fn: () => void) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) => done(() => reject(e)));
      child.on('close', (code) => done(() => resolve({ stdout, stderr, code })));
    });
  }

  private parseJson<T>(out: string): T | null {
    try {
      return JSON.parse(out.trim()) as T;
    } catch {
      return null;
    }
  }

  /** `login --headless`: start OAuth Device Flow, parse the key: value block. */
  async startLogin(): Promise<DeviceFlowStart> {
    const { stdout, stderr } = await this.run(['login', '--headless'], 30000);
    const text = `${stdout}\n${stderr}`;
    const pick = (k: string) => text.match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
    const verification_uri = pick('verification_uri');
    const device_code = pick('device_code');
    if (!verification_uri || !device_code) {
      throw new Error(`login did not return device-flow material: ${text.slice(0, 160)}`);
    }
    return { verification_uri, user_code: pick('user_code'), device_code, expires_at: pick('expires_at') || null };
  }

  /** `login checklogin`: poll once for authorization. Judged by text, not exit
   *  code (a VIP-less account logs in successfully but the CLI exits 1). */
  async pollLogin(deviceCode: string, pollSec = 3): Promise<LoginResult> {
    const { stdout, stderr } = await this.run(
      ['login', 'checklogin', `--device_code=${deviceCode}`, `--poll=${pollSec}`],
      (pollSec + 15) * 1000,
    );
    const text = `${stdout}\n${stderr}`;
    const user_id = text.match(/user_id:\s*(\S+)/)?.[1];
    if (text.includes('登录成功')) {
      if (text.includes('没有 dreamina_cli 使用权限') || text.includes('会员等级')) {
        return { state: 'no_permission', user_id, message: '登录成功，但该账号无生成权限（需高级及以上会员）' };
      }
      return { state: 'success', user_id };
    }
    if (text.includes('超时')) return { state: 'expired', message: '登录超时，请重试' };
    return { state: 'pending', message: text.trim() || undefined };
  }

  /** `user_credit`: doubles as a login-state probe (JSON when logged in). */
  async credit(): Promise<CreditInfo> {
    const { stdout, stderr } = await this.run(['user_credit'], 20000);
    const raw = `${stdout}${stderr}`.trim();
    if (!raw || raw.includes('未检测到有效登录态')) return { logged_in: false, error: '即梦 CLI 未登录' };
    const j = this.parseJson<Record<string, unknown>>(stdout);
    if (!j) return { logged_in: false, error: raw || 'unknown user_credit output' };
    return {
      logged_in: true,
      total_credit: typeof j.total_credit === 'number' ? j.total_credit : undefined,
      user_id: j.user_id != null ? String(j.user_id) : undefined,
      user_name: (j.user_name as string) || undefined,
      vip_level: (j.vip_level as string) || undefined,
    };
  }

  async logout(): Promise<void> {
    await this.run(['logout'], 15000);
  }

  /** Submit a generator command with poll=0, returns submit_id immediately. */
  async submit(command: string, flags: string[], signal?: AbortSignal): Promise<SubmitResult> {
    const { stdout, stderr } = await this.run([command, ...flags, '--poll=0'], 60000, signal);
    const j = this.parseJson<RawResult>(stdout);
    if (!j?.submit_id) {
      throw new Error(`no submit_id from ${command}: ${(stdout || stderr).slice(0, 200)}`);
    }
    return toSubmitResult(j);
  }

  /** `query_result --submit_id`: current status + finished media. */
  async queryResult(submitId: string, signal?: AbortSignal): Promise<SubmitResult> {
    const { stdout, stderr } = await this.run(['query_result', `--submit_id=${submitId}`], 30000, signal);
    const j = this.parseJson<RawResult>(stdout);
    if (!j?.submit_id) {
      throw new Error(`query_result parse failed: ${(stdout || stderr).slice(0, 200)}`);
    }
    return toSubmitResult(j);
  }
}

function toSubmitResult(j: RawResult): SubmitResult {
  const images = (j.result_json?.images ?? [])
    .filter((i) => i.image_url)
    .map((i) => ({ url: i.image_url as string, width: i.width, height: i.height }));
  const videos = (j.result_json?.videos ?? [])
    .filter((v) => v.video_url)
    .map((v) => ({ url: v.video_url as string, width: v.width, height: v.height }));
  const gen_status = j.gen_status === 'success' ? 'success' : j.gen_status === 'fail' ? 'fail' : 'querying';
  return { submit_id: j.submit_id as string, gen_status, fail_reason: j.fail_reason || undefined, images, videos };
}
