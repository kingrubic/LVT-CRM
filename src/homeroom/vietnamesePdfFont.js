import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const FONT_URL = new URL('../assets/fonts/NotoSans-Regular.ttf', import.meta.url);

export function loadVietnamesePdfFontBytes() {
  return new Uint8Array(readFileSync(fileURLToPath(FONT_URL)));
}
