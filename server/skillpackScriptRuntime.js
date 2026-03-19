import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const RUNTIME_COMMANDS = {
  node: {
    command: process.execPath,
    buildArgs: (scriptPath) => [scriptPath],
  },
  python: {
    command: 'python',
    buildArgs: (scriptPath) => [scriptPath],
  },
  powershell: {
    command: 'powershell',
    buildArgs: (scriptPath) => ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
  },
};

function ensureArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function resolveScriptPath(scriptPath) {
  const normalized = String(scriptPath || '').trim();
  if (!normalized) {
    throw new Error('技能脚本缺少路径。');
  }
  return path.isAbsolute(normalized) ? normalized : path.join(REPO_ROOT, normalized);
}

export function selectSkillPackScripts(skillPack, phase) {
  return ensureArray(skillPack?.scripts?.entries)
    .filter((entry) => String(entry.phase || '').trim() === String(phase || '').trim());
}

function runSingleScript(entry, envelope) {
  const runtime = RUNTIME_COMMANDS[entry.runtime];
  if (!runtime) {
    throw new Error(`未支持的技能脚本 runtime: ${entry.runtime}`);
  }

  const absolutePath = resolveScriptPath(entry.path);
  const timeoutMs = Number(entry.timeoutMs) || 10000;

  return new Promise((resolve, reject) => {
    const child = spawn(runtime.command, runtime.buildArgs(absolutePath), {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(new Error(`技能脚本 ${entry.id} 执行超时（${timeoutMs}ms）。`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk || '');
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
    });

    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`技能脚本 ${entry.id} 执行失败（exit ${code}）。${stderr ? `\n${stderr.trim()}` : ''}`));
        return;
      }

      if (!stdout.trim()) {
        resolve({ payload: envelope.payload, notes: '', metadata: {} });
        return;
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve({
          payload: parsed?.payload ?? envelope.payload,
          notes: String(parsed?.notes || '').trim(),
          metadata: parsed?.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {},
        });
      } catch (error) {
        reject(new Error(`技能脚本 ${entry.id} 输出不是合法 JSON。${stderr ? `\n${stderr.trim()}` : ''}`));
      }
    });

    child.stdin.write(JSON.stringify(envelope));
    child.stdin.end();
  });
}

export async function runSkillPackScripts({
  skillPack,
  phase,
  capabilityId,
  stageKind,
  payload,
  context = {},
}) {
  const scripts = selectSkillPackScripts(skillPack, phase);
  if (scripts.length === 0) {
    return {
      payload,
      executions: [],
      metadata: {},
    };
  }

  let nextPayload = payload;
  const executions = [];
  const mergedMetadata = {};

  for (const entry of scripts) {
    const envelope = {
      phase,
      capabilityId,
      stageKind,
      skillPackId: skillPack?.id || null,
      payload: nextPayload,
      context,
    };

    try {
      const result = await runSingleScript(entry, envelope);
      nextPayload = result.payload;
      Object.assign(mergedMetadata, result.metadata || {});
      executions.push({
        id: entry.id,
        label: entry.label,
        phase: entry.phase,
        status: 'succeeded',
        notes: result.notes || '',
      });
    } catch (error) {
      if (!entry.allowFailure) {
        throw error;
      }
      executions.push({
        id: entry.id,
        label: entry.label,
        phase: entry.phase,
        status: 'failed',
        notes: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    payload: nextPayload,
    executions,
    metadata: mergedMetadata,
  };
}
