import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

const BASE_URL = 'https://www.kidsa-z.com';
const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const CONCURRENCY = 4;
const API_DELAY_MS = 500;
const RATE_LIMIT_WAIT_MS = 6000;

interface StudentTask {
  className: string;
  studentId: number;
  screenName: string;
  passwordCombination: number[];
  passwordNames: string[];
  index: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
  await page.fill(inputSelector, 'msummer13');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  return { browser, context, page };
}

async function loginAndFetchData(
  page: Page,
  task: StudentTask,
  workerId: number
): Promise<{ readingStats?: any; assignmentStatus?: any; earnedStars?: number } | null> {
  try {
    const loginResult = await page.evaluate(async (params: {
      loginUrl: string;
      studentId: number;
      className: string;
      iconicPassword: number[];
    }) => {
      try {
        const response = await fetch(params.loginUrl, {
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
      loginUrl: `${BASE_URL}/ng/api/kids/tokens`,
      studentId: task.studentId,
      className: task.className,
      iconicPassword: task.passwordCombination,
    });

    if (loginResult.status === 429) {
      await sleep(RATE_LIMIT_WAIT_MS);
      return null;
    }

    if (loginResult.status === 403 || loginResult.status === 0) {
      console.log(`  [W${workerId}] Session issue for ${task.screenName}`);
      return null;
    }

    if (!loginResult.accessGranted) {
      console.log(`  [W${workerId}] Login failed for ${task.screenName}`);
      return null;
    }

    const earnedStars = loginResult.stars;

    const readingStats = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        const text = await resp.text();
        if (text.startsWith('{')) return JSON.parse(text);
        return null;
      } catch { return null; }
    }, `${BASE_URL}/ng/api/kids/student/stats/primary-reading`);

    const assignmentStatus = await page.evaluate(async (url: string) => {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        const text = await resp.text();
        if (text.startsWith('{')) return JSON.parse(text);
        return null;
      } catch { return null; }
    }, `${BASE_URL}/ng/api/kids/student/reading/assignment/self-paced/status`);

    await page.evaluate(async (url: string) => {
      try { await fetch(url, { credentials: 'include' }); } catch {}
    }, `${BASE_URL}/ng/api/kids/tokens/sign-out`);

    return {
      earnedStars,
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
    };
  } catch (e: any) {
    console.log(`  [W${workerId}] Error fetching data for ${task.screenName}: ${e.message?.substring(0, 100)}`);
    return null;
  }
}

async function isPageAlive(page: Page): Promise<boolean> {
  try {
    await page.evaluate(() => 1 + 1);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log('=== Fetch Missing Student Data (msummer13 & msummer17) ===');
  console.log(`  Concurrency: ${CONCURRENCY}`);

  const resultsFile = path.join(DATA_DIR, 'probe-results.json');
  const results: any[] = JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));

  const targetClasses = ['msummer13', 'msummer17'];
  const tasks: StudentTask[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!targetClasses.includes(r.className)) continue;
    if (r.readingStats && r.assignmentStatus) continue;
    tasks.push({
      className: r.className,
      studentId: r.studentId,
      screenName: r.screenName,
      passwordCombination: r.passwordCombination,
      passwordNames: r.passwordNames,
      index: i,
    });
  }

  console.log(`  Students needing data: ${tasks.length}`);
  for (const t of tasks) {
    console.log(`    ${t.className}/${t.screenName}`);
  }
  console.log();

  if (tasks.length === 0) {
    console.log('All students already have data!');
    return;
  }

  let completed = 0;
  const startTime = Date.now();

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

        console.log(`  [W${workerId}] ${task.className}/${task.screenName}...`);

        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (!(await isPageAlive(page!))) {
              await reinitBrowser();
            }

            const data = await loginAndFetchData(page!, task, workerId);

            if (data) {
              results[task.index].earnedStars = data.earnedStars ?? results[task.index].earnedStars;
              results[task.index].readingStats = data.readingStats;
              results[task.index].assignmentStatus = data.assignmentStatus;
              completed++;
              console.log(`  [W${workerId}] OK: ${task.screenName} stars=${data.earnedStars} reading=${!!data.readingStats} assignment=${!!data.assignmentStatus}`);
              break;
            } else {
              console.log(`  [W${workerId}] Retry ${attempt + 1} for ${task.screenName}`);
              await sleep(2000);
            }
          } catch (e: any) {
            console.log(`  [W${workerId}] ERROR: ${task.screenName}: ${e.message?.substring(0, 80)}`);
            await reinitBrowser();
          }
        }

        await sleep(API_DELAY_MS);

        if (completed % 5 === 0 && completed > 0) {
          fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
          const elapsed = (Date.now() - startTime) / 1000;
          console.log(`  Progress: ${completed}/${tasks.length} | ${(completed / (elapsed / 60)).toFixed(1)}/min`);
        }
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

  const taskQueue = [...tasks];
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) {
    workers.push(workerFn(w, taskQueue));
  }

  await Promise.all(workers);

  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  DATA FETCH COMPLETE`);
  console.log(`  Completed: ${completed}/${tasks.length}`);
  console.log(`  Time: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} min`);

  const c13 = results.filter((r: any) => r.className === 'msummer13');
  const c17 = results.filter((r: any) => r.className === 'msummer17');
  console.log(`  msummer13: ${c13.filter((r: any) => r.readingStats).length}/${c13.length} with readingStats`);
  console.log(`  msummer17: ${c17.filter((r: any) => r.readingStats).length}/${c17.length} with readingStats`);
}

main().catch(console.error);
