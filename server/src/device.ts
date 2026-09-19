/**
 * Parses a User-Agent string into a friendly, readable device and browser label.
 * Example outputs:
 * - "iPhone · Safari"
 * - "Android · Chrome"
 * - "macOS · Chrome"
 * - "Windows · Edge"
 * - "Linux · Firefox"
 */
export function parseUserAgent(ua?: string | null): string {
  if (!ua || typeof ua !== 'string' || !ua.trim()) {
    return 'Unknown Device';
  }

  const s = ua.trim();

  // 1. Detect Operating System / Hardware
  let os = 'Unknown OS';
  if (/iPhone/i.test(s)) {
    os = 'iPhone';
  } else if (/iPad/i.test(s)) {
    os = 'iPad';
  } else if (/Android/i.test(s)) {
    os = 'Android';
  } else if (/Macintosh|Mac OS X/i.test(s)) {
    os = 'macOS';
  } else if (/Windows/i.test(s)) {
    os = 'Windows';
  } else if (/CrOS/i.test(s)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(s)) {
    os = 'Linux';
  }

  // 2. Detect Browser
  let browser = 'Browser';
  if (/SamsungBrowser\/([0-9.]+)/i.test(s)) {
    browser = 'Samsung Internet';
  } else if (/Edg\/|Edge\//i.test(s)) {
    browser = 'Edge';
  } else if (/OPR\/|Opera\//i.test(s)) {
    browser = 'Opera';
  } else if (/CriOS\/([0-9.]+)/i.test(s)) {
    browser = 'Chrome';
  } else if (/FxiOS\/([0-9.]+)/i.test(s)) {
    browser = 'Firefox';
  } else if (/Chrome\/([0-9.]+)/i.test(s)) {
    browser = 'Chrome';
  } else if (/Firefox\/([0-9.]+)/i.test(s)) {
    browser = 'Firefox';
  } else if (/Safari\/([0-9.]+)/i.test(s) && !/Chrome\//i.test(s)) {
    browser = 'Safari';
  } else if (/curl|wget|postman/i.test(s)) {
    browser = 'API Client';
  }

  if (os === 'Unknown OS' && browser === 'Browser') {
    return 'Unknown Device';
  }
  if (os === 'Unknown OS') {
    return browser;
  }
  return `${os} · ${browser}`;
}
