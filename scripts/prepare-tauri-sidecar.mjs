import { build } from 'esbuild';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const serverDir = path.join(repoRoot, 'server');
const binariesDir = path.join(repoRoot, 'src-tauri', 'binaries');
const serverEntry = path.join(serverDir, 'index.js');
const serverNodeModulesDir = path.join(serverDir, 'node_modules');
const serverBundlePath = path.join(binariesDir, 'server-bundle.mjs');
const targetTriple = resolveTargetTriple();
const sidecarBinaryName = `aiyou-server-${targetTriple}${process.platform === 'win32' ? '.exe' : ''}`;
const sidecarBinaryPath = path.join(binariesDir, sidecarBinaryName);
const sourceEnvPath = path.join(serverDir, '.env');
const targetEnvPath = path.join(binariesDir, '.env');
const packageLockPath = path.join(serverDir, 'package-lock.json');
const targetNodeModulesDir = path.join(binariesDir, 'node_modules');

await ensureDirectory(binariesDir);
await ensureServerDependencies();
await buildServerBundle();
await syncServerNodeModules();
await syncRuntimeBinary();
await syncServerEnv();

console.log(`[tauri-sidecar] prepared ${path.relative(repoRoot, binariesDir).replaceAll(path.sep, '/')}`);

function resolveTargetTriple() {
  if (process.env.TAURI_ENV_TARGET_TRIPLE) {
    return process.env.TAURI_ENV_TARGET_TRIPLE;
  }

  const key = `${process.platform}-${process.arch}`;
  switch (key) {
    case 'win32-x64':
      return 'x86_64-pc-windows-msvc';
    case 'win32-arm64':
      return 'aarch64-pc-windows-msvc';
    case 'darwin-x64':
      return 'x86_64-apple-darwin';
    case 'darwin-arm64':
      return 'aarch64-apple-darwin';
    case 'linux-x64':
      return 'x86_64-unknown-linux-gnu';
    case 'linux-arm64':
      return 'aarch64-unknown-linux-gnu';
    default:
      throw new Error(`Unsupported sidecar target for ${key}. Set TAURI_ENV_TARGET_TRIPLE explicitly.`);
  }
}

async function ensureDirectory(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureServerDependencies() {
  if (fs.existsSync(serverNodeModulesDir)) {
    return;
  }

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCommand, ['install', '--prefix', 'server'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to install server dependencies (exit ${result.status ?? 'unknown'}).`);
  }
}

async function buildServerBundle() {
  await build({
    entryPoints: [serverEntry],
    outfile: serverBundlePath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    target: [`node${process.versions.node.split('.')[0]}`],
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  });
}

async function syncServerNodeModules() {
  if (!(await shouldRefreshNodeModules())) {
    return;
  }

  await fsp.rm(targetNodeModulesDir, { recursive: true, force: true });
  await fsp.cp(serverNodeModulesDir, targetNodeModulesDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
}

async function shouldRefreshNodeModules() {
  if (!fs.existsSync(targetNodeModulesDir)) {
    return true;
  }

  if (!fs.existsSync(packageLockPath)) {
    return false;
  }

  const [sourceStat, targetStat] = await Promise.all([
    fsp.stat(packageLockPath),
    fsp.stat(targetNodeModulesDir),
  ]);

  return sourceStat.mtimeMs > targetStat.mtimeMs;
}

async function syncRuntimeBinary() {
  const runtimePath = process.execPath;
  if (!fs.existsSync(sidecarBinaryPath) || (await isSourceNewer(runtimePath, sidecarBinaryPath))) {
    await fsp.copyFile(runtimePath, sidecarBinaryPath);
  }
}

async function syncServerEnv() {
  if (!fs.existsSync(sourceEnvPath)) {
    await fsp.rm(targetEnvPath, { force: true });
    return;
  }

  if (!fs.existsSync(targetEnvPath) || (await isSourceNewer(sourceEnvPath, targetEnvPath))) {
    await fsp.copyFile(sourceEnvPath, targetEnvPath);
  }
}

async function isSourceNewer(sourcePath, targetPath) {
  const [sourceStat, targetStat] = await Promise.all([
    fsp.stat(sourcePath),
    fsp.stat(targetPath),
  ]);

  return sourceStat.mtimeMs > targetStat.mtimeMs;
}
