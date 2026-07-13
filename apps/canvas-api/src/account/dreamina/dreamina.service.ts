import { Injectable } from '@nestjs/common';

import { DreaminaCliRunner } from './dreamina-cli.runner';

/**
 * 即梦 login/account surface for the admin UI. Backed by the local CLI via
 * DreaminaCliRunner (no more Python bridge). Login is OAuth Device Flow:
 * startLogin() hands the front-end a verification_uri + device_code; the UI
 * opens the URL and polls pollLogin() until success.
 */
@Injectable()
export class DreaminaService {
  constructor(private readonly runner: DreaminaCliRunner) {}

  /** Login state + credit (logged_in / vip_level / total_credit). */
  getStatus() {
    return this.runner.credit();
  }

  /** Begin device-flow login; returns verification_uri / user_code / device_code. */
  startLogin() {
    return this.runner.startLogin();
  }

  /** Poll authorization for a device_code (front-end calls this on an interval). */
  pollLogin(deviceCode: string) {
    return this.runner.pollLogin(deviceCode);
  }

  /** Clear the local OAuth state. */
  logout() {
    return this.runner.logout();
  }
}
