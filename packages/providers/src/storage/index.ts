export * from './types';
export * from './shared';
export * from './local';
export * from './s3';
export * from './r2';
export * from './azure';

import { azureBlobDriver } from './azure';
import { localStorageDriver } from './local';
import { r2Driver } from './r2';
import { s3Driver } from './s3';

export const storageDrivers = [localStorageDriver, s3Driver, r2Driver, azureBlobDriver] as const;
