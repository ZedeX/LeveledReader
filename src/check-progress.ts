import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const RESULTS_FILE = path.join(DATA_DIR, 'probe-results.json');
const FAILED_FILE = path.join(DATA_DIR, 'probe-failed.json');
const STUDENTS_FILE = path.join(DATA_DIR, 'all-class-students.json');
const LIVE_FILE = path.join(DATA_DIR, 'probe-live.json');

interface StudentInfo { className: string; studentId: number; screenName: string; }

interface LiveWorkerState {
  workerId: number;
  className: string;
  screenName: string;
  currentCombo: number[];
  currentComboNames: string[];
  attempts: number;
  totalCombos: number;
  phase: '1digit' | '2digit';
  updatedAt: string;
}

function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.log('No results file found. Probe not started yet.');
    return;
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  const students: StudentInfo[] = fs.existsSync(STUDENTS_FILE)
    ? JSON.parse(fs.readFileSync(STUDENTS_FILE, 'utf-8')).flatMap((c: any) =>
        c.students.map((s: any) => ({ className: c.className, studentId: s.studentId, screenName: s.screenName }))
      )
    : [];

  const successIds = new Set(results.map((r: any) => r.studentId));
  const failedList = fs.existsSync(FAILED_FILE) ? JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8')) : [];
  const failedIds = new Set(failedList.map((f: any) => f.studentId));

  const byClass = new Map<string, { total: number; success: number; failed: number; pending: number }>();

  for (const s of students) {
    if (!byClass.has(s.className)) byClass.set(s.className, { total: 0, success: 0, failed: 0, pending: 0 });
    const c = byClass.get(s.className)!;
    c.total++;
    if (successIds.has(s.studentId)) c.success++;
    else if (failedIds.has(s.studentId)) c.failed++;
    else c.pending++;
  }

  console.log('\n========================================');
  console.log('  Kids A-Z Password Probe - Progress');
  console.log('========================================\n');

  let grandTotal = 0, grandSuccess = 0, grandFailed = 0, grandPending = 0;

  for (const [cls, c] of [...byClass.entries()].sort()) {
    const pct = c.total > 0 ? Math.round((c.success / c.total) * 100) : 0;
    const bar = '#'.repeat(Math.floor(pct / 5)) + '-'.repeat(20 - Math.floor(pct / 5));
    console.log(`  ${cls}: [${bar}] ${c.success}/${c.total} (${pct}%) | ${c.failed} failed | ${c.pending} pending`);
    grandTotal += c.total;
    grandSuccess += c.success;
    grandFailed += c.failed;
    grandPending += c.pending;
  }

  const grandPct = grandTotal > 0 ? Math.round((grandSuccess / grandTotal) * 100) : 0;
  console.log('\n----------------------------------------');
  console.log(`  TOTAL: ${grandSuccess}/${grandTotal} (${grandPct}%) | ${grandFailed} failed | ${grandPending} pending`);
  console.log('========================================\n');

  let liveStates: LiveWorkerState[] = [];
  try {
    if (fs.existsSync(LIVE_FILE)) {
      liveStates = JSON.parse(fs.readFileSync(LIVE_FILE, 'utf-8'));
    }
  } catch {}

  if (liveStates.length > 0) {
    console.log('--- Live Worker Status ---\n');
    for (const w of liveStates.sort((a, b) => a.workerId - b.workerId)) {
      const pct = w.totalCombos > 0 ? Math.round((w.attempts / w.totalCombos) * 100) : 0;
      const barW = 20;
      const filled = Math.floor(pct / 5);
      const bar = '#'.repeat(filled) + '-'.repeat(barW - filled);
      const phaseLabel = w.phase === '1digit' ? '1-digit' : '2-digit';
      console.log(`  [W${w.workerId}] ${w.className}/${w.screenName}`);
      console.log(`         Phase: ${phaseLabel} | Trying: ${w.currentComboNames.join('-')} [${w.currentCombo.join(',')}]`);
      console.log(`         Progress: [${bar}] ${w.attempts}/${w.totalCombos} (${pct}%)`);

      const elapsed = Date.now() - new Date(w.updatedAt).getTime();
      if (elapsed > 30000) {
        console.log(`         WARNING: No update for ${(elapsed / 1000).toFixed(0)}s - may be stuck or waiting`);
      }
      console.log();
    }
  } else {
    console.log('  (No active probe running)\n');
  }

  if (grandPending > 0) {
    console.log('--- Pending Students ---\n');
    for (const [cls, c] of [...byClass.entries()].sort()) {
      if (c.pending > 0) {
        const pendingNames = students
          .filter(s => s.className === cls && !successIds.has(s.studentId) && !failedIds.has(s.studentId))
          .map(s => s.screenName);
        console.log(`  ${cls} (${c.pending}): ${pendingNames.join(', ')}`);
      }
    }
    console.log();
  }
}

main();
