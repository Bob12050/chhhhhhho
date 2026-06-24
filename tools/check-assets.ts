/**
 * Verify dropped-in art under public/assets against the expected spec
 * (presence + exact dimensions + frame divisibility). Missing files are fine
 * (the game falls back to a generated placeholder) — they are reported so you
 * can see what is still using a placeholder.
 *
 * Run: npm run check-assets
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPngSize } from './png';
import { ASSET_SPECS } from './asset-list';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let present = 0;
let problems = 0;
let missing = 0;

for (const spec of ASSET_SPECS) {
  const file = join(root, 'public', spec.src);
  const tag = `${spec.label} (${spec.src})`;
  if (!existsSync(file)) {
    missing++;
    console.log(`  ▫ 未配置  ${tag} → プレースホルダー使用`);
    continue;
  }
  const size = readPngSize(readFileSync(file));
  if (!size) {
    problems++;
    console.log(`  ✗ PNGではない/壊れている  ${tag}`);
    continue;
  }
  const issues: string[] = [];
  if (size.width !== spec.w || size.height !== spec.h) {
    issues.push(`寸法 期待 ${spec.w}x${spec.h} / 実際 ${size.width}x${size.height}`);
  }
  if (spec.type === 'sheet') {
    if (size.width % spec.frameW! !== 0 || size.height % spec.frameH! !== 0) {
      issues.push(`コマ割り不整合 (${spec.frameW}x${spec.frameH}で割り切れない)`);
    }
  }
  if (issues.length) {
    problems++;
    console.log(`  ⚠ ${tag}\n      ${issues.join('\n      ')}`);
  } else {
    present++;
    console.log(`  ✓ OK  ${tag}  ${size.width}x${size.height}`);
  }
}

console.log(
  `\n本物 ${present} / 問題 ${problems} / 未配置 ${missing}  （全 ${ASSET_SPECS.length}）`,
);
if (problems > 0) {
  console.error('問題のあるアセットがあります。寸法/コマ割りを修正してください。');
  process.exit(1);
}
