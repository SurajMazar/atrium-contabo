import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, formatPercent, formatRatio, pluralize } from './format';

describe('format helpers', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(null)).toBe('—');
  });
  it('formats durations', () => {
    expect(formatDuration(420)).toBe('420ms');
    expect(formatDuration(4200)).toBe('4.2s');
    expect(formatDuration(72_000)).toBe('1m 12s');
    expect(formatDuration(3 * 3600_000 + 5 * 60_000)).toBe('3h 5m');
  });
  it('formats percentages and ratios', () => {
    expect(formatPercent(3.4)).toBe('3.4%');
    expect(formatPercent(0.5)).toBe('0.5%');
    expect(formatRatio(0.034)).toBe('3.4%');
  });
  it('pluralizes', () => {
    expect(pluralize(1, 'page')).toBe('1 page');
    expect(pluralize(3, 'page')).toBe('3 pages');
  });
});
