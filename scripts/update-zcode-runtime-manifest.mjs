// Mechanical manifest regeneration for reviewed public sources only.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { directory, runtimeFiles } from './zcode-runtime-files.mjs';
const manifest = [...runtimeFiles].map(([name, file]) => `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`).join('\n') + '\n';
writeFileSync(join(directory, 'SHA256SUMS.txt'), manifest);
console.log(`Public ZCode manifest updated: ${runtimeFiles.size} files.`);
