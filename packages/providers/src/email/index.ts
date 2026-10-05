export * from './types';
export * from './shared';
export * from './smtp';
export * from './http-providers';

import { smtpDriver } from './smtp';
import { mailgunDriver, postmarkDriver, resendDriver, sendgridDriver } from './http-providers';

export const emailDrivers = [smtpDriver, resendDriver, mailgunDriver, sendgridDriver, postmarkDriver] as const;
