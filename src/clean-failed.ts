import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const RESULTS_FILE = path.join(DATA_DIR, 'probe-results.json');
const FAILED_FILE = path.join(DATA_DIR, 'probe-failed.json');

const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
const successIds = new Set(results.map((r: any) => r.studentId));

let failedList: any[] = [];
try {
  failedList = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
} catch {}

const realFailed = failedList.filter(f => !successIds.has(f.studentId));

console.log(`Results: ${results.length} successful`);
console.log(`Failed records: ${failedList.length} total, ${realFailed.length} real failures`);

const failedByClass = new Map<string, number>();
for (const f of realFailed) {
  failedByClass.set(f.className, (failedByClass.get(f.className) || 0) + 1);
}
for (const [cls, count] of failedByClass) {
  console.log(`  ${cls}: ${count} failed`);
}

fs.writeFileSync(FAILED_FILE, JSON.stringify(realFailed, null, 2));
console.log(`\nCleaned failed list saved`);
