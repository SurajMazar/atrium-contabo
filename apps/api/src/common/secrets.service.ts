import { Injectable } from '@nestjs/common';
import { decryptJson, encryptJson } from '@atrium/server-kit';

/** Application-managed encryption for credentials at rest (AES-256-GCM via server-kit). */
@Injectable()
export class SecretsService {
  encrypt(value: unknown): string {
    return encryptJson(value);
  }
  decrypt<T>(enc: string): T {
    return decryptJson<T>(enc);
  }
}
