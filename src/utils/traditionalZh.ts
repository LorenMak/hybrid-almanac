/**
 * Convert Simplified Chinese library strings → Traditional (Taiwan) for reports.
 * lunar-typescript ships `chs` / `en` only; we post-process for 繁中 primary output.
 */

import * as OpenCC from 'opencc-js';

const convert = OpenCC.Converter({ from: 'cn', to: 'tw' });

export function toTraditional(text: string): string {
  return convert(text);
}

export function toTraditionalList(items: string[]): string[] {
  return items.map(toTraditional);
}
