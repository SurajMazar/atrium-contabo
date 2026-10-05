import type { TestResult } from '../driver';

export interface SmsParams {
  to: string;
  body: string;
  from?: string;
}

export interface SmsResult {
  id?: string;
  status: 'queued' | 'sent' | 'failed';
  provider: string;
  raw?: unknown;
}

export interface SmsProvider {
  readonly driver: string;
  send(params: SmsParams): Promise<SmsResult>;
  test(to?: string): Promise<TestResult>;
}
