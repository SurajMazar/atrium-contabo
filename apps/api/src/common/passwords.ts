import { randomBytes } from 'node:crypto';
import { validation } from './errors';

export const PASSWORD_MIN = 10;

/** Password policy for every account (sign-up, reset, change, accounts created by an admin). */
export function assertPasswordStrength(password: string) {
  if (password.length < PASSWORD_MIN) throw validation(`Password must be at least ${PASSWORD_MIN} characters`);
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) throw validation('Use a mix of upper and lower case letters, numbers and symbols');
}

/** A random password that satisfies the policy (shown once to the admin who created the account). */
export function generatePassword(): string {
  return `${randomBytes(12).toString('base64url')}-Ab3`;
}
