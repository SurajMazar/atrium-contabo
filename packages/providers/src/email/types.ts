import type { TestResult } from '../driver';

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailMessage {
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  tags?: Record<string, string>;
}

export interface SendResult {
  id?: string;
  accepted: string[];
  rejected: string[];
  provider: string;
}

export interface EmailProvider {
  readonly driver: string;
  send(message: EmailMessage): Promise<SendResult>;
  test(to?: string): Promise<TestResult>;
}
