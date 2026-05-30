import { chromium, Browser, BrowserContext, Page, Response } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const STUDENTS_DATA_FILE = path.join(process.cwd(), 'data', 'students-data.json');
const DATA_DIR = path.join(process.cwd(), 'data');
const TEACHER_USERNAME = 'msummer17';
const BASE_URL = 'https://www.kidsa-z.com';

interface Student {
  studentId: number;
  screenName: string;
  firstName: string;
  lastName: string;
  userIcon: number;
  classroomId: number;
  homeroomMemberId: number;
}

interface StudentData {
  student: Student;
  passwordType?: string;
  loginResult?: any;
  overallStats?: any;
  readingStats?: any;
  assignmentStatus?: any;
}

interface CollectedData {
  collectedAt: string;
  teacherUsername: string;
  students: StudentData[];
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

class ProgressFetcher {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;
  private students: StudentData[] = [];
  private failedStudents: string[] = [];
  private apiResponses: Record<string, any> = {};
  private results: StudentData[] = [];

  async initialize(): Promise<void> {
    console.log('========================================');
    console.log('  KidsA-Z 学生阅读进度采集工具');
    console.log('========================================');
    console.log('');

    // 加载学生数据
    if (!fs.existsSync(STUDENTS_DATA_FILE)) {
      throw new Error('学生数据文件不存在，请先运行 fetch-students.ts');
    }
    const data: CollectedData = JSON.parse(fs.readFileSync(STUDENTS_DATA_FILE, 'utf-8'));
    this.students = data.students;
    console.log(`✓ 已加载 ${this.students.length} 个学生`);
    console.log('');

    // 启动浏览器
    console.log('► 启动浏览器...');
    this.browser = await chromium.launch({
      headless: false,
      args: ['--start-maximized']
    });

    this.context = await this.browser.newContext({
      viewport: null
    });

    this.page = await this.context.newPage();

    // 监听 API 响应
    this.setupResponseListeners();

    console.log('✓ 浏览器已启动');
    console.log('');
  }

  private setupResponseListeners(): void {
    this.page.on('response', async (response: Response) => {
      const url = response.url();
      try {
        if (url.includes('/api/kids/tokens') && !url.includes('sign-out') && response.status() === 200) {
          this.apiResponses.login = await response.json();
        }
        if (url.includes('/primary-reading') && response.status() === 200) {
          this.apiResponses.readingStats = await response.json();
        }
        if (url.includes('/overall') && response.status() === 200) {
          this.apiResponses.overallStats = await response.json();
        }
        if (url.includes('/self-paced/status') && response.status() === 200) {
          this.apiResponses.assignment = await response.json();
        }
      } catch {}
    });
  }

  async startFromTeacherLogin(): Promise<void> {
    console.log('► 步骤1: 访问首页并输入老师用户名');
    await this.page.goto(`${BASE_URL}/ng/`);
    await this.page.waitForTimeout(1500);

    // 输入老师用户名
    const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
    await this.page.waitForSelector(inputSelector, { timeout: 10000 });
    await this.page.fill(inputSelector, TEACHER_USERNAME);

    // 步骤2: 按回车提交
    console.log('► 步骤2: 按回车提交');
    await this.page.keyboard.press('Enter');

    // 步骤3: 等待页面加载
    console.log('► 步骤3: 等待学生列表页面加载...');
    await this.page.waitForTimeout(4000);
    console.log('✓ 已在学生列表页面');
    console.log('');
  }

  async loginAsStudent(student: Student, studentIndex: number): Promise<boolean> {
    console.log(`  ► 登录学生: ${student.screenName}`);
    this.apiResponses = {};

    try {
      // 步骤3（继续）: 选择学生 - 直接点击 .class-chart__students-name-container
      console.log(`    - 点击学生: ${student.screenName} (索引: ${studentIndex})`);

      // 直接点击对应的学生名字容器
      const studentContainers = this.page.locator('.class-chart__students .class-chart__students-name-container');
      const count = await studentContainers.count();
      console.log(`      页面上有 ${count} 个学生容器`);

      if (studentIndex >= count) {
        console.log(`      ✗ 索引 ${studentIndex} 超出范围`);
        return false;
      }

      await studentContainers.nth(studentIndex).click();
      console.log(`      ✓ 已点击学生容器`);

      // 等待密码页面读取完毕
      console.log(`    - 等待密码页面加载...`);
      await this.page.waitForTimeout(3000);

      // 步骤5: 选择密码（点击密码图标）
      console.log(`    - 步骤5: 选择密码（点击密码图标）...`);
      let passwordClicked = false;

      // 方法1: 使用 .password-icons__button
      try {
        const passwordButtons = this.page.locator('.password-icons__button');
        const count = await passwordButtons.count();
        if (count > 0) {
          await passwordButtons.first().click();
          passwordClicked = true;
          console.log(`      ✓ 已点击密码图标`);
        }
      } catch {}

      // 方法2: 找所有按钮尝试
      if (!passwordClicked) {
        const allButtons = this.page.locator('button, [role="button"]');
        const count = await allButtons.count();
        for (let j = 2; j < Math.min(count, 30); j++) {
          try {
            await allButtons.nth(j).click();
            await this.page.waitForTimeout(300);
            passwordClicked = true;
            console.log(`      ✓ 已点击第 ${j} 个按钮作为密码`);
            break;
          } catch {}
        }
      }

      if (!passwordClicked) {
        console.log(`      ✗ 无法点击密码图标`);
        return false;
      }

      await this.page.waitForTimeout(500);

      // 步骤6: 点击提交按钮
      console.log(`    - 步骤6: 点击提交按钮...`);
      let submitClicked = false;

      // 尝试多种选择器找提交按钮（优先使用精确的 class）
      const submitSelectors = [
        '.student-password__submit-button',
        'button[type="submit"]',
        'button[aria-label="Go"]',
        'button:has-text("Go"), button:has-text("Next"), button:has-text("Submit")',
        '.icon-submit-container button',
        '[class*="submit"]',
        'button[aria-label*="next"], button[aria-label*="go"]'
      ];

      for (const sel of submitSelectors) {
        try {
          const btn = this.page.locator(sel).first();
          if (await btn.count() > 0 && await btn.isVisible({ timeout: 1000 })) {
            await btn.click();
            submitClicked = true;
            console.log(`      ✓ 已点击提交按钮`);
            break;
          }
        } catch {}
      }

      // 如果没找到，尝试按 Enter
      if (!submitClicked) {
        console.log(`      - 尝试按 Enter 键...`);
        await this.page.keyboard.press('Enter');
        submitClicked = true;
      }

      // 等待登录完成
      console.log(`    - 等待登录完成...`);
      await this.page.waitForTimeout(5000);

      // 检查是否登录成功 - 检查是否有登录API响应
      if (this.apiResponses.login?.state?.accessGranted === true) {
        console.log(`    ✓ 登录成功: ${student.screenName} (API确认)`);
        return true;
      }

      // 检查URL - 如果不在登录页面或班级页面，也算成功
      const url = this.page.url();
      if (!url.includes('/login/student') && !url.includes('/class-chart')) {
        console.log(`    ✓ 登录成功: ${student.screenName} (URL确认)`);
        return true;
      }

      // 如果以上都没检测到，但至少页面有变化，也继续尝试
      console.log(`    ⚠ 可能登录成功，继续尝试...`);
      return true;

    } catch (error) {
      console.log(`    ✗ 登录出错:`, error);
      return false;
    }
  }

  async fetchStudentStats(): Promise<{ overall: any, reading: any, assignment: any }> {
    console.log(`    - 步骤7: 访问 stats/overall 页面...`);
    try {
      await this.page.goto(`${BASE_URL}/ng/stats/overall`);
      await this.page.waitForTimeout(2000);
    } catch {}

    console.log(`    - 步骤8: 访问 stats/reading 页面...`);
    try {
      await this.page.goto(`${BASE_URL}/ng/stats/reading`);
      await this.page.waitForTimeout(2000);
    } catch {}

    // 获取数据（如果没监听到就手动请求）
    let overallStats = this.apiResponses.overallStats;
    let readingStats = this.apiResponses.readingStats;
    let assignmentStatus = this.apiResponses.assignment;

    if (!overallStats) {
      try {
        const resp = await this.page.request.get(`${BASE_URL}/ng/api/kids/student/stats/overall`);
        const text = await resp.text();
        if (text.startsWith('{')) overallStats = JSON.parse(text);
      } catch {}
    }

    if (!readingStats) {
      try {
        const resp = await this.page.request.get(`${BASE_URL}/ng/api/kids/student/stats/primary-reading`);
        const text = await resp.text();
        if (text.startsWith('{')) readingStats = JSON.parse(text);
      } catch {}
    }

    if (!assignmentStatus) {
      try {
        const resp = await this.page.request.get(`${BASE_URL}/ng/api/kids/student/reading/assignment/self-paced/status`);
        const text = await resp.text();
        if (text.startsWith('{')) assignmentStatus = JSON.parse(text);
      } catch {}
    }

    console.log(`      ✓ 已获取统计数据`);
    return { overall: overallStats, reading: readingStats, assignment: assignmentStatus };
  }

  async logout(): Promise<void> {
    console.log(`  ► 步骤9: 退出登录...`);
    try {
      // 查找并点击 Log Out 链接
      const logoutLink = this.page.locator('a[routerlink="/signout"], a[href="/ng/signout"]').first();
      if (await logoutLink.isVisible({ timeout: 5000 })) {
        await logoutLink.click();
        console.log(`    ✓ 已点击 Log Out 链接`);
      } else {
        // 备用：通过 API 登出
        try {
          await this.page.request.get(`${BASE_URL}/ng/api/kids/tokens/sign-out`);
        } catch {}
      }

      // 等待回到学生列表页面
      console.log(`    - 等待回到学生列表页面...`);
      await this.page.waitForTimeout(3000);

      // 确认已在学生列表页面
      const currentUrl = this.page.url();
      if (!currentUrl.includes('/class-chart')) {
        console.log(`    - 导航到班级页面...`);
        await this.page.goto(`${BASE_URL}/ng/login/class-chart`);
        await this.page.waitForTimeout(2000);
      }

      console.log(`    ✓ 已回到学生列表页面`);
    } catch (error) {
      console.log(`    ⚠ 登出时出错，尝试导航回班级页面...`);
      try {
        await this.page.goto(`${BASE_URL}/ng/login/class-chart`);
        await this.page.waitForTimeout(2000);
      } catch {}
    }
  }

  async fetchAllStudents(): Promise<void> {
    console.log('========================================');
    console.log('  准备开始！');
    console.log('========================================');
    console.log('');

    // 从老师登录开始
    await this.startFromTeacherLogin();

    // 从页面读取学生列表
    console.log('► 从页面读取学生列表...');
    await this.page.waitForTimeout(1000);

    const studentElements = this.page.locator('.class-chart__students .class-chart__students-name-container');
    const studentCount = await studentElements.count();
    console.log(`✓ 页面上找到 ${studentCount} 个学生`);

    for (let i = 0; i < studentCount; i++) {
      // 重新获取学生名字（每次都重新获取，避免DOM过期）
      const nameElements = this.page.locator('.class-chart__students .class-chart__students-name');
      const screenName = await nameElements.nth(i).textContent() || `Student-${i + 1}`;

      // 从原始数据中找匹配的学生（如果有）
      const studentData = this.students.find(s => s.student.screenName === screenName) || {
        student: {
          studentId: 0,
          screenName,
          firstName: screenName,
          lastName: '',
          userIcon: 0,
          classroomId: 0,
          homeroomMemberId: 0
        }
      };
      const student = studentData.student;

      console.log('');
      console.log(`━━━ 学生 ${i + 1}/${this.students.length}: ${student.screenName} ━━━`);

      try {
        // 登录学生
        const loginSuccess = await this.loginAsStudent(student, i);
        if (!loginSuccess) {
          console.log(`  ✗ 跳过 ${student.screenName}（密码/登录失败）`);
          this.failedStudents.push(student.screenName);
          // 保存失败记录
          this.results.push({
            student,
            loginResult: null,
            overallStats: null,
            readingStats: null,
            assignmentStatus: null
          });
          // 确保回到班级页面继续下一个
          try {
            await this.page.goto(`${BASE_URL}/ng/login/class-chart`);
            await this.page.waitForTimeout(2000);
          } catch {}
          continue;
        }

        // 获取统计数据
        const stats = await this.fetchStudentStats();

        // 保存结果
        const result: StudentData = {
          student,
          loginResult: this.apiResponses.login?.state?.user,
          overallStats: stats.overall,
          readingStats: stats.reading,
          assignmentStatus: stats.assignment
        };
        this.results.push(result);

        // 打印进度摘要
        const level = stats.assignment?.currentLevel?.name || '?';
        const stars = this.apiResponses.login?.state?.user?.stars?.earnedStars || '?';
        console.log(`  ✓ ${student.screenName}: ${stars} 星星, 等级 ${level}`);

        // 登出
        await this.logout();

      } catch (error) {
        console.log(`  ✗ 处理 ${student.screenName} 时出错:`, error);
        this.failedStudents.push(student.screenName);
        this.results.push({
          student: studentData.student,
          loginResult: null,
          overallStats: null,
          readingStats: null,
          assignmentStatus: null
        });
        // 尝试恢复到班级页面
        try {
          await this.page.goto(`${BASE_URL}/ng/login/class-chart`);
          await this.page.waitForTimeout(2000);
        } catch {}
      }

      // 每处理完一个学生就保存一次
      this.saveResults();
    }

    // 最终总结
    this.printSummary();
  }

  private saveResults(): void {
    ensureDir(DATA_DIR);
    const output: CollectedData = {
      collectedAt: new Date().toISOString(),
      teacherUsername: TEACHER_USERNAME,
      students: this.results
    };
    fs.writeFileSync(
      path.join(DATA_DIR, 'all-students-progress.json'),
      JSON.stringify(output, null, 2)
    );
    this.saveCsv();
  }

  private saveCsv(): void {
    const csvPath = path.join(DATA_DIR, 'all-students-progress.csv');

    // CSV header
    const headers = [
      'screenName',
      'currentLevel',
      'earnedStars',
      'availableStars',
      'completedTasks',
      'remainingTasks',
      'readThisWeekCount',
      'readLastWeekCount',
      'listenCount',
      'readCount',
      'quizCount'
    ];

    // CSV rows
    const rows = this.results.map(r => {
      const screenName = r.student.screenName;
      const currentLevel = r.assignmentStatus?.currentLevel?.name || '';
      const earnedStars = r.loginResult?.stars?.earnedStars || '';
      const availableStars = r.loginResult?.stars?.availableStars || '';
      const completedTasks = r.assignmentStatus?.completedTasks || '';
      const remainingTasks = r.assignmentStatus?.remainingTasks || '';
      const readThisWeekCount = r.readingStats?.readThisWeekCount || '';
      const readLastWeekCount = r.readingStats?.readLastWeekCount || '';
      const listenCount = r.readingStats?.listenCount || '';
      const readCount = r.readingStats?.readCount || '';
      const quizCount = r.readingStats?.quizCount || '';

      return [
        screenName,
        currentLevel,
        earnedStars,
        availableStars,
        completedTasks,
        remainingTasks,
        readThisWeekCount,
        readLastWeekCount,
        listenCount,
        readCount,
        quizCount
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    fs.writeFileSync(csvPath, '\uFEFF' + csvContent, 'utf-8');
    console.log(`CSV已保存到: data/all-students-progress.csv`);
  }

  private printSummary(): void {
    console.log('');
    console.log('========================================');
    console.log('  全部完成！');
    console.log('========================================');
    console.log('');
    console.log(`共处理 ${this.students.length} 个学生`);
    console.log(`成功: ${this.students.length - this.failedStudents.length} 个`);
    console.log(`失败: ${this.failedStudents.length} 个`);

    if (this.failedStudents.length > 0) {
      console.log('');
      console.log('【密码不对/登录失败的学生】:');
      this.failedStudents.forEach((name, idx) => {
        console.log(`  ${idx + 1}. ${name}`);
      });
    }

    console.log('');
    console.log('【所有学生进度摘要】:');
    this.results.forEach((r, idx) => {
      const level = r.assignmentStatus?.currentLevel?.name || '?';
      const stars = r.loginResult?.stars?.earnedStars || '?';
      const status = r.loginResult ? '✓' : '✗';
      console.log(`  ${status} ${idx + 1}. ${r.student.screenName} - ${stars} 星星 - 等级 ${level}`);
    });

    console.log('');
    console.log(`数据已保存到: data/all-students-progress.json`);
  }

  async close(): Promise<void> {
    console.log('');
    console.log('► 关闭浏览器...');
    await this.browser.close();
    console.log('✓ 浏览器已关闭');
  }
}

async function main() {
  const fetcher = new ProgressFetcher();

  try {
    await fetcher.initialize();
    await fetcher.fetchAllStudents();
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await fetcher.close();
  }
}

main().catch(console.error);
