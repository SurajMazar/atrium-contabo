export * from './types';
export * from './phone';
export * from './drivers';

import { aakashDriver, httpSmsDriver, snsDriver, sparrowDriver, twilioDriver, vonageDriver } from './drivers';

export const smsDrivers = [twilioDriver, vonageDriver, snsDriver, httpSmsDriver, sparrowDriver, aakashDriver] as const;
