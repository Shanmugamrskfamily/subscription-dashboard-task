export type DeviceKind = 'desktop' | 'phone' | 'tablet';

// Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

// iPadOS 13+ reports itself as a Mac, so iPads without "iPad" in the string read as macOS.
const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/iPad/, 'iPadOS'],
  [/iPhone|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/CrOS/, 'ChromeOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux/, 'Linux'],
];

const match = (ua: string, list: [RegExp, string][]) =>
  list.find(([pattern]) => pattern.test(ua))?.[1];

/** A short, human label for a session's user agent, e.g. "Chrome on Windows". */
export function describeDevice(ua: string): { label: string; kind: DeviceKind } {
  const browser = match(ua, BROWSERS);
  const system = match(ua, SYSTEMS);
  // Android phones say "Mobile"; Android tablets don't.
  const kind: DeviceKind =
    /iPad|Tablet/i.test(ua) || (/Android/.test(ua) && !/Mobi/.test(ua))
      ? 'tablet'
      : /Mobi|iPhone|iPod/.test(ua)
        ? 'phone'
        : 'desktop';

  if (browser && system) return { label: `${browser} on ${system}`, kind };
  if (browser || system) return { label: (browser ?? system) as string, kind };
  return { label: 'Unknown device', kind };
}
