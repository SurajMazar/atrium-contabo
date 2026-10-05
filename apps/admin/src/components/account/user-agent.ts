export interface ParsedUserAgent {
  browser: string;
  os: string;
  mobile: boolean;
}

/** Minimal UA parsing — good enough to label sessions, not for feature detection. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS', mobile: false };
  const s = ua;
  const ver = (re: RegExp) => re.exec(s)?.[1]?.split('.')[0];

  let browser = 'Unknown browser';
  let v: string | undefined;
  if ((v = ver(/Edg(?:e|A|iOS)?\/([\d.]+)/))) browser = `Edge ${v}`;
  else if ((v = ver(/OPR\/([\d.]+)/))) browser = `Opera ${v}`;
  else if ((v = ver(/SamsungBrowser\/([\d.]+)/))) browser = `Samsung Internet ${v}`;
  else if ((v = ver(/Firefox\/([\d.]+)/)) || (v = ver(/FxiOS\/([\d.]+)/))) browser = `Firefox ${v}`;
  else if ((v = ver(/CriOS\/([\d.]+)/))) browser = `Chrome ${v}`;
  else if ((v = ver(/Chrome\/([\d.]+)/))) browser = `Chrome ${v}`;
  else if (/Safari\//.test(s) && (v = ver(/Version\/([\d.]+)/))) browser = `Safari ${v}`;
  else if (/curl\//i.test(s)) browser = 'curl';
  else if (/node|undici|axios/i.test(s)) browser = 'API client';

  let os = 'Unknown OS';
  if (/iPhone|iPad|iPod/.test(s)) os = /iPad/.test(s) ? 'iPadOS' : 'iOS';
  else if (/Android/.test(s)) os = 'Android';
  else if (/CrOS/.test(s)) os = 'ChromeOS';
  else if (/Mac OS X|Macintosh/.test(s)) os = 'macOS';
  else if (/Windows/.test(s)) os = 'Windows';
  else if (/Linux/.test(s)) os = 'Linux';

  return { browser, os, mobile: /Mobi|iPhone|Android(?!.*Tablet)/.test(s) };
}
