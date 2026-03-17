import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const screenshotDir = path.join(rootDir, 'output', 'playwright');
const screenshotPath = path.join(screenshotDir, 'create-project-flow.png');
const host = '127.0.0.1';
const port = 4173;
const projectName = `playwright-${Date.now()}`;

async function ensureOutputDir() {
  await fs.mkdir(screenshotDir, { recursive: true });
}

async function openProjectsDashboard(page) {
  const bodyText = await page.locator('body').innerText();
  if (!bodyText.includes('系列设定与剧本规划')) {
    return;
  }

  const backButton = page.getByRole('button', { name: '返回项目' }).first();
  if (await backButton.count()) {
    await backButton.click();
    await page.waitForFunction(
      () => document.body.innerText.includes('项目仓库') || document.body.innerText.includes('Project Library'),
      undefined,
      { timeout: 20000 },
    );
  }
}

async function clickCreateProjectEntry(page) {
  const headerCreateButton = page.getByRole('button', { name: '新建项目' }).first();
  if (await headerCreateButton.count()) {
    await headerCreateButton.click();
    return;
  }

  const heroCreateButton = page.getByRole('button', { name: '创建新项目' }).first();
  if (await heroCreateButton.count()) {
    await heroCreateButton.click();
    return;
  }

  throw new Error('未找到创建项目入口按钮。');
}

async function run() {
  await ensureOutputDir();

  const server = await createServer({
    root: rootDir,
    configFile: path.join(rootDir, 'vite.config.ts'),
    logLevel: 'error',
    server: {
      host,
      port,
      strictPort: true,
    },
  });

  await server.listen();

  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://${host}:${port}`, { waitUntil: 'networkidle', timeout: 30000 });
    await openProjectsDashboard(page);
    await clickCreateProjectEntry(page);

    await page.getByPlaceholder('例如：校园漫剧主线 / 古风系列 A').fill(projectName);
    await page.getByRole('button', { name: '创建漫剧项目' }).click();

    await page.waitForFunction(
      (expectedProjectName) => {
        const bodyText = document.body.innerText;
        return bodyText.includes('系列设定与剧本规划')
          && bodyText.includes(expectedProjectName)
          && bodyText.includes(`${expectedProjectName} · 漫剧工作流`);
      },
      projectName,
      { timeout: 20000 },
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const bodyText = await page.locator('body').innerText();
    console.log(JSON.stringify({
      ok: true,
      projectName,
      screenshotPath,
      preview: bodyText.slice(0, 1000),
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
