import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSkillPackScripts, selectSkillPackScripts } from './skillpackScriptRuntime.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

function createTempNodeScript(source: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiyou-skill-script-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, 'transform.js');
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

describe('skillpackScriptRuntime', () => {
  it('selects scripts by phase', () => {
    const scripts = selectSkillPackScripts({
      scripts: {
        entries: [
          { id: 'a', label: 'A', path: 'scripts/a.js', runtime: 'node', phase: 'before_prompt' },
          { id: 'b', label: 'B', path: 'scripts/b.js', runtime: 'node', phase: 'after_normalize' },
        ],
      },
    }, 'before_prompt');

    expect(scripts.map((item) => item.id)).toEqual(['a']);
  });

  it('runs declared scripts and merges payload updates', async () => {
    const scriptPath = createTempNodeScript(`
      let input = '';
      process.stdin.on('data', (chunk) => { input += chunk; });
      process.stdin.on('end', () => {
        const envelope = JSON.parse(input);
        process.stdout.write(JSON.stringify({
          payload: {
            ...envelope.payload,
            enriched: true,
            phaseEcho: envelope.phase,
          },
          notes: 'processed',
          metadata: {
            marker: 'ok',
          },
        }));
      });
    `);

    const result = await runSkillPackScripts({
      skillPack: {
        id: 'test-pack',
        scripts: {
          entries: [
            {
              id: 'transform',
              label: 'Transform payload',
              path: scriptPath,
              runtime: 'node',
              phase: 'before_prompt',
            },
          ],
        },
      },
      phase: 'before_prompt',
      capabilityId: 'video_prompt_generate',
      stageKind: 'video_prompt_generate',
      payload: { base: true },
      context: { projectId: 'project_1' },
    });

    expect(result.payload).toEqual({
      base: true,
      enriched: true,
      phaseEcho: 'before_prompt',
    });
    expect(result.executions).toEqual([
      expect.objectContaining({
        id: 'transform',
        status: 'succeeded',
        notes: 'processed',
      }),
    ]);
    expect(result.metadata).toEqual({ marker: 'ok' });
  });
});
