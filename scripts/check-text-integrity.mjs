import path from 'node:path';
import { formatIssueReport, scanTextIntegrity } from './textEncodingTools.mjs';

const rootDir = process.cwd();
const results = scanTextIntegrity(rootDir);

if (results.length > 0) {
  console.error('检测到文本完整性问题：');
  console.error(formatIssueReport(results, rootDir));
  process.exit(1);
}

console.log(`文本完整性检查通过：${path.basename(rootDir)}`);
