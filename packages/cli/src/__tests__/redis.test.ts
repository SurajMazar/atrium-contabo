import { describe, expect, it } from 'vitest';
import { encodeCommand, parseResp } from '../lib/redis';

describe('RESP', () => {
  it('encodes commands as bulk strings', () => {
    expect(encodeCommand(['SET', 'k', 'é']).toString()).toBe(
      '*3\r\n$3\r\nSET\r\n$1\r\nk\r\n$2\r\né\r\n',
    );
  });

  it('parses all reply types', () => {
    expect(parseResp(Buffer.from('+PONG\r\n'))?.value).toBe('PONG');
    expect(parseResp(Buffer.from(':42\r\n'))?.value).toBe(42);
    expect(parseResp(Buffer.from('$5\r\nhello\r\n'))?.value).toBe('hello');
    expect(parseResp(Buffer.from('$-1\r\n'))?.value).toBeNull();
    expect(parseResp(Buffer.from('*2\r\n$1\r\n0\r\n*2\r\n$1\r\na\r\n$1\r\nb\r\n'))?.value).toEqual([
      '0',
      ['a', 'b'],
    ]);
    expect(parseResp(Buffer.from('-ERR boom\r\n'))?.value).toBeInstanceOf(Error);
  });

  it('returns null for incomplete frames', () => {
    expect(parseResp(Buffer.from('$5\r\nhel'))).toBeNull();
    expect(parseResp(Buffer.from('*2\r\n$1\r\na\r\n'))).toBeNull();
  });
});
