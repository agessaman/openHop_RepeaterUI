export interface CartoTileUrls {
  baseUrl: string;
  labelsUrl: string;
}

export function getCartoTileUrls(
  darkMode: boolean,
  apiKey: string | null | undefined,
): CartoTileUrls | null {
  const key = apiKey?.trim();
  if (!key) return null;

  const style = darkMode ? 'dark' : 'light';
  const encodedKey = encodeURIComponent(key);
  const root = `https://{s}.basemaps.cartocdn.com/${style}`;

  return {
    baseUrl: `${root}_nolabels/{z}/{x}/{y}{r}.png?key=${encodedKey}`,
    labelsUrl: `${root}_only_labels/{z}/{x}/{y}{r}.png?key=${encodedKey}`,
  };
}
