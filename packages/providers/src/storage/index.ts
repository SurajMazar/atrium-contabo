export * from './types';
export * from './shared';
export * from './local';
export * from './s3';
export * from './azure';

import { azureBlobDriver } from './azure';
import { localStorageDriver } from './local';
import { s3Driver } from './s3';

export const storageDrivers = [localStorageDriver, s3Driver, azureBlobDriver] as const;
