import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const executable=process.argv[2];
if(!executable || !path.isAbsolute(executable)) throw new Error('Pass the candidate EXE absolute path. This check never executes it.');
const binary=fs.readFileSync(executable);
if(binary[0]!==77 || binary[1]!==90) throw new Error('Not a Windows executable.');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const protectedFiles=new Set();
const main=path.join(root,'src-tauri/resources/diana-runtime');
const core=JSON.parse(fs.readFileSync(path.join(main,'manifest.json'),'utf8'));
for(const name of Object.keys(core.sha256)) {
  const normalized=name.replaceAll('\\','/');
  protectedFiles.add(path.join(normalized.startsWith('assets/')?path.join(root,'theme-preview'):main,normalized));
}
for(const target of ['cursor','grokbot']) {
  const directory=path.join(root,'src-tauri/resources/theme-packs',target,'runtime');
  for(const line of fs.readFileSync(path.join(directory,'SHA256SUMS.txt'),'utf8').trim().split('\n')) {
    const relative=line.split('  ')[1];
    protectedFiles.add(path.join(relative.startsWith('assets/')?path.join(root,'theme-preview'):directory,relative));
  }
}
const zcode=path.join(root,'src-tauri/resources/theme-packs/zcode/runtime');
for(const line of fs.readFileSync(path.join(zcode,'manifest.sha256'),'utf8').trim().split(/\r?\n/)) protectedFiles.add(path.join(zcode,line.split(' *')[1]));
for(const file of protectedFiles) if(binary.indexOf(fs.readFileSync(file))<0) throw new Error(`Compiled file bytes missing: ${path.relative(root,file)}`);
const copies=[];
for(const file of fs.readdirSync(path.join(root,'theme-preview/assets')).filter(f=>f.endsWith('.png'))) {
  const data=fs.readFileSync(path.join(root,'theme-preview/assets',file));
  let offset=-1,count=0;
  while((offset=binary.indexOf(data,offset+1))>=0) count++;
  // The existing launcher ornament also uses this small star via its own UI asset.
  const maximum=file==='diana-hand-star-reference-v2.png'?2:1;
  if(count<1 || count>maximum) throw new Error(`Unexpected raw artwork duplication: ${file} (${count})`);
  copies.push({file,copies:count});
}
const music=process.env.DIANA_HOPEFUL_DREAMER_AUDIO;
if(!music || !path.isAbsolute(music)) throw new Error('Set DIANA_HOPEFUL_DREAMER_AUDIO to the approved build source for this music-bearing candidate check.');
const audio=fs.readFileSync(music);
if(audio.length===0 || binary.indexOf(audio)<0) throw new Error('Built-in music does not match the supplied build source.');
console.log(JSON.stringify({status:'candidate_binary_checked',file:path.basename(executable),bytes:binary.length,sha256:digest(binary),
  compiledUniqueProtectedFiles:protectedFiles.size,musicBytes:audio.length,musicSha256:digest(audio),sharedArtwork:copies,
  nativeAccepted:false,published:false},null,2));
