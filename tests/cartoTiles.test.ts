import { describe, expect, it } from 'vitest';
import { getCartoTileUrls } from '@/utils/cartoTiles';

describe('CARTO tile URLs', () => {
  it('adds an encoded API key to both dark tile layers', () => {
    expect(getCartoTileUrls(true, 'key with/+symbols')).toEqual({
      baseUrl:
        'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=key%20with%2F%2Bsymbols',
      labelsUrl:
        'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=key%20with%2F%2Bsymbols',
    });
  });

  it('uses light tile layers when light mode is active', () => {
    expect(getCartoTileUrls(false, 'carto-key')).toEqual({
      baseUrl: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=carto-key',
      labelsUrl:
        'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png?key=carto-key',
    });
  });

  it('does not request CARTO tiles without a key', () => {
    expect(getCartoTileUrls(true, '   ')).toBeNull();
  });
});
