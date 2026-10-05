/**
 * E.164 phone normalization without a heavyweight dependency. Handles separators, `00`
 * international prefixes, national trunk `0`, and a default country for local numbers.
 * This is a syntactic normalizer (8–15 digits), not full number-plan validation.
 */
export const COUNTRY_CALLING_CODES: Record<string, string> = {
  NP: '977', IN: '91', BD: '880', PK: '92', LK: '94', BT: '975', CN: '86', JP: '81', KR: '82', SG: '65', MY: '60',
  TH: '66', ID: '62', PH: '63', VN: '84', AE: '971', SA: '966', QA: '974', KW: '965', OM: '968', BH: '973', IL: '972',
  TR: '90', US: '1', CA: '1', MX: '52', BR: '55', AR: '54', CL: '56', CO: '57', PE: '51', GB: '44', IE: '353', FR: '33',
  DE: '49', ES: '34', IT: '39', NL: '31', BE: '32', CH: '41', AT: '43', SE: '46', NO: '47', DK: '45', FI: '358', PL: '48',
  PT: '351', GR: '30', CZ: '420', HU: '36', RO: '40', UA: '380', RU: '7', ZA: '27', NG: '234', KE: '254', EG: '20',
  MA: '212', GH: '233', ET: '251', TZ: '255', UG: '256', AU: '61', NZ: '64', HK: '852', TW: '886',
};

const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}

function callingCode(defaultCountry?: string): string | undefined {
  if (!defaultCountry) return undefined;
  const c = defaultCountry.trim().replace(/^\+/, '');
  if (/^\d{1,4}$/.test(c)) return c;
  return COUNTRY_CALLING_CODES[c.toUpperCase()];
}

/**
 * Normalize to E.164 (`+9779812345678`). `defaultCountry` is an ISO-3166 alpha-2 code
 * (`NP`) or calling code (`977`) applied to numbers without an international prefix.
 * Returns `undefined` when the input can't be normalized.
 */
export function normalizePhoneE164(input: string, defaultCountry?: string): string | undefined {
  if (!input) return undefined;
  let s = input.trim().replace(/^tel:/i, '').replace(/[\s().\-–/]/g, '');
  s = s.replace(/(?:ext|x|#)\d+$/i, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    const digits = s.slice(1).replace(/\D/g, '');
    const out = `+${digits}`;
    return isE164(out) ? out : undefined;
  }
  const digits = s.replace(/\D/g, '');
  if (!digits) return undefined;
  const cc = callingCode(defaultCountry);
  if (!cc) {
    const out = `+${digits}`;
    return digits.length >= 10 && isE164(out) ? out : undefined;
  }
  // Already includes the country code (e.g. 9779812345678 for NP)?
  if (digits.startsWith(cc) && digits.length - cc.length >= 7 && digits.length > 10) {
    const out = `+${digits}`;
    if (isE164(out)) return out;
  }
  const national = digits.replace(/^0+/, '');
  const out = `+${cc}${national}`;
  return isE164(out) ? out : undefined;
}

/** National significant number for providers that want local format (e.g. Nepal 10-digit `98XXXXXXXX`). */
export function toNationalNumber(input: string, country: string): string | undefined {
  const e164 = normalizePhoneE164(input, country);
  const cc = callingCode(country);
  if (!e164 || !cc) return undefined;
  return e164.startsWith(`+${cc}`) ? e164.slice(cc.length + 1) : undefined;
}

/** GSM-7 vs UCS-2 segment estimate (useful for cost previews). */
export function smsSegments(body: string): { encoding: 'GSM-7' | 'UCS-2'; segments: number; length: number } {
  // eslint-disable-next-line no-control-regex
  const gsm = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
  const isGsm = gsm.test(body);
  const length = [...body].length;
  const single = isGsm ? 160 : 70;
  const multi = isGsm ? 153 : 67;
  return { encoding: isGsm ? 'GSM-7' : 'UCS-2', segments: length <= single ? 1 : Math.ceil(length / multi), length };
}
