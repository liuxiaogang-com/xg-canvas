import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type VerificationPurpose = 'login' | 'bind' | 'merge_confirm';

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger('EmailSender');
  private readonly host?: string;
  private readonly port: number;
  private readonly secure: boolean;
  private readonly user?: string;
  private readonly pass?: string;
  private readonly from?: string;
  private transporter?: Transporter<SMTPTransport.SentMessageInfo>;
  private warnedDisabled = false;

  constructor(private readonly config: ConfigService) {
    this.host = this.read('SMTP_HOST');
    this.port = Number(this.read('SMTP_PORT') ?? 465);
    this.secure = this.flag('SMTP_SECURE', this.port === 465);
    this.user = this.read('SMTP_USER');
    this.pass = this.read('SMTP_PASS');
    this.from = this.read('MAIL_FROM') ?? this.read('SMTP_FROM') ?? this.user;
  }

  get enabled(): boolean {
    return !!(this.host && this.user && this.pass && this.from);
  }

  async sendVerificationCode(to: string, code: string, purpose: VerificationPurpose): Promise<boolean> {
    return this.send({
      to,
      subject: this.subjectForPurpose(purpose),
      text: [
        `你的 XG Canvas 验证码是：${code}`,
        '',
        '验证码 10 分钟内有效，请勿转发给他人。',
      ].join('\n'),
      html: [
        '<p>你的 XG Canvas 验证码是：</p>',
        `<p style="font-size:24px;font-weight:700;letter-spacing:4px;">${code}</p>`,
        '<p>验证码 10 分钟内有效，请勿转发给他人。</p>',
      ].join(''),
    });
  }

  async sendMagicLink(to: string, link: string): Promise<boolean> {
    return this.send({
      to,
      subject: 'XG Canvas 登录链接',
      text: ['点击下面的链接登录 XG Canvas：', link, '', '链接 30 分钟内有效，请勿转发给他人。'].join('\n'),
      html: [
        '<p>点击下面的链接登录 XG Canvas：</p>',
        `<p><a href="${this.escapeAttr(link)}">登录 XG Canvas</a></p>`,
        '<p>链接 30 分钟内有效，请勿转发给他人。</p>',
      ].join(''),
    });
  }

  private async send(message: { to: string; subject: string; text: string; html: string }): Promise<boolean> {
    if (!this.enabled) {
      if (!this.warnedDisabled) {
        this.warnedDisabled = true;
        this.logger.warn('SMTP is not configured; email delivery is disabled');
      }
      return false;
    }
    await this.getTransporter().sendMail({ from: this.from, ...message });
    this.logger.log(`email sent to ${message.to}: ${message.subject}`);
    return true;
  }

  private getTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.secure,
        auth: { user: this.user, pass: this.pass },
      });
    }
    return this.transporter;
  }

  private subjectForPurpose(purpose: VerificationPurpose): string {
    if (purpose === 'bind') return 'XG Canvas 绑定邮箱验证码';
    if (purpose === 'merge_confirm') return 'XG Canvas 账号确认验证码';
    return 'XG Canvas 登录验证码';
  }

  private read(name: string): string | undefined {
    const value = this.config.get<string>(name)?.trim();
    return value || undefined;
  }

  private flag(name: string, fallback: boolean): boolean {
    const value = this.read(name);
    if (value === undefined) return fallback;
    return value === 'true' || value === '1';
  }

  private escapeAttr(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
}
