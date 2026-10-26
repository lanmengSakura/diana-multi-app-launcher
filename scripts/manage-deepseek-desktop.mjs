// Official plugin-profile integration only. No CDP, application patching, or
// process termination. Fully quit the desktop before any profile write.
import {readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, unlinkSync, openSync, closeSync, mkdirSync, constants} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export const PLUGIN = 'dsh-diana-theme';
export function selectBundle(manifest, enable) {
  if(manifest.name!=='dsh-profile-desktop' || !Array.isArray(manifest.dsh?.profile?.bundles)) throw new Error('PROFILE_NOT_DESKTOP');
  const bundles=manifest.dsh.profile.bundles.filter(name=>name!==PLUGIN);
  if(enable)bundles.push(PLUGIN);
  return {...manifest,dsh:{...manifest.dsh,profile:{...manifest.dsh.profile,bundles}}};
}
export function pluginStatus(manifest) {
  return {installed:typeof manifest.dependencies?.[PLUGIN]==='string',selected:manifest.dsh?.profile?.bundles?.includes(PLUGIN)===true};
}
function run() {
  const [action,executable,pluginRoot]=process.argv.slice(2);
  if(!['enable','disable'].includes(action))throw new Error('INVALID_ACTION');
  if(!executable || !pluginRoot)throw new Error('MISSING_PATH');
  const profile=join(process.env.DSH_HOME?.trim() || join(homedir(),'.dsh'),'profiles/desktop');
  const manifestPath=join(profile,'package.json');
  const readManifest=()=>JSON.parse(readFileSync(manifestPath,'utf8').replace(/^\uFEFF/,''));
  const original=readManifest(); selectBundle(original,false);
  const ps=join(process.env.SystemRoot || 'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const script=`$ErrorActionPreference='Stop';$p=@(Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'"|Where-Object {$_.CommandLine -notlike '*dsh-desktop-host*lib*cli.js*'});[Console]::Write($p.Count)`;
  const assertDesktopExited=()=>{
    const probe=spawnSync(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:15000});
    if(probe.status!==0 || !/^0$/.test(probe.stdout.trim()))throw new Error('DESKTOP_MUST_EXIT');
  };
  assertDesktopExited();
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(const name of ['package.json','cordis.patch.yml','pnpm-lock.yaml']) {
    const file=join(profile,name); if(existsSync(file))copyFileSync(file,join(profile,`${name}.diana-before-${stamp}`));
  }
  if(action==='enable') {
    const plugin=JSON.parse(readFileSync(join(pluginRoot,'package.json'),'utf8'));
    if(plugin.name!==PLUGIN || plugin.version!=='0.1.0-local.2')throw new Error('PLUGIN_IDENTITY_MISMATCH');
    const packageFiles=['package.json','client.js','index.js','cordis.patch.yml','README.md','LICENSE','ASSET_LICENSES.md'];
    const digest=createHash('sha256');
    for(const name of packageFiles)digest.update(name).update(readFileSync(join(pluginRoot,name)));
    // The official manager snapshots file: dependencies by source path. Give
    // each immutable package revision its own path so local updates are real.
    const packageRoot=join(process.env.LOCALAPPDATA || join(homedir(),'AppData/Local'),'DianaCodexLauncher/multi-app-v1/deepseek-packages',`${plugin.version}-${digest.digest('hex').slice(0,20)}`);
    mkdirSync(packageRoot,{recursive:true});
    for(const name of packageFiles) {
      const destination=join(packageRoot,name);
      if(!existsSync(destination))copyFileSync(join(pluginRoot,name),destination,constants.COPYFILE_EXCL);
      if(!readFileSync(destination).equals(readFileSync(join(pluginRoot,name))))throw new Error('PACKAGE_SNAPSHOT_MISMATCH');
    }
    const cli=join(dirname(executable),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js');
    const result=spawnSync(executable,['--expose-internals',cli,'plugin','--profile','desktop','add',`file:${resolve(packageRoot)}`,'--offline','--ignore-scripts'],{
      env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,encoding:'utf8',timeout:120000,
      cwd:profile,maxBuffer:2*1024*1024
    });
    if(result.status!==0)throw new Error('OFFICIAL_PLUGIN_INSTALL_FAILED');
    const matches=()=>['package.json','client.js','index.js','cordis.patch.yml'].every(name=>{
      const checksum=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
      return checksum(join(profile,'node_modules',PLUGIN,name))===checksum(join(pluginRoot,name));
    });
    if(!matches())throw new Error('INSTALLED_PLUGIN_STALE');
  }
  // Same write-exclusion file used by Desktop.
  const lockPath=join(profile,'lock');
  let lock;
  try {
    lock=openSync(lockPath,'wx');
    assertDesktopExited();
    const before=readFileSync(manifestPath,'utf8');
    const current=JSON.parse(before.replace(/^\uFEFF/,''));
    const next=selectBundle(current,action==='enable');
    if(action==='enable' && !pluginStatus(current).installed)throw new Error('PLUGIN_INSTALL_NOT_CONFIRMED');
    const temporary=join(profile,`package.diana-${stamp}.tmp`);
    if(readFileSync(manifestPath,'utf8')!==before)throw new Error('PROFILE_CHANGED');
    writeFileSync(temporary,JSON.stringify(next,null,2)+'\n',{flag:'wx'});
    renameSync(temporary,manifestPath);
  } finally { if(lock!==undefined){closeSync(lock);unlinkSync(lockPath);} }
  console.log(JSON.stringify({status:action==='enable'?'plugin_enabled':'plugin_disabled',appFilesModified:false,debugPortOpened:false}));
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) {
  try { run(); } catch(error) { console.error(JSON.stringify({status:'error',code:/^[A-Z_]+$/.test(error.message)?error.message:'PLUGIN_PROFILE_UPDATE_FAILED'})); process.exitCode=1; }
}
