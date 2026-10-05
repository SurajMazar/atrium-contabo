import { describe, expect, it } from 'vitest';
import { isPublicPath, safeNext } from './auth-paths';

describe('auth redirect helpers', () => {
  it('only allows in-app return URLs', () => {
    expect(safeNext('/w/abc/pages?x=1')).toBe('/w/abc/pages?x=1');
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext(null, '/onboarding')).toBe('/onboarding');
  });
  it('recognises public routes', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/invite/tok')).toBe(true);
    expect(isPublicPath('/reset-password')).toBe(true);
    expect(isPublicPath('/w/123')).toBe(false);
    expect(isPublicPath('/')).toBe(false);
  });
});
