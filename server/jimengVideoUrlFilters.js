const IGNORED_URL_PATTERNS = [
  'record-loading-animation',
  '/static/media/record-loading-animation',
  'loading-animation-light',
  'loading-animation-dark',
];

export function isIgnoredJimengVideoUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.toLowerCase();
  return IGNORED_URL_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function looksLikeReusableJimengVideoUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return false;
  }

  const normalized = value.toLowerCase();
  if (isIgnoredJimengVideoUrl(normalized)) {
    return false;
  }

  return normalized.includes('.mp4')
    || normalized.includes('.m3u8')
    || normalized.includes('video/mp4')
    || normalized.includes('/video/')
    || normalized.includes('/media/')
    || normalized.includes('play_addr');
}
