import { chromium, Browser, Page, Response } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'students-data.json');

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
  loginResult?: {
    id: string;
    screenName: string;
    earnedStars: number;
    availableStars: number;
  };
  stats?: any;
  assignmentStatus?: any;
}

interface CollectedData {
  collectedAt: string;
  teacherUsername: string;
  memberInfo: any;
  classroom: any;
  students: StudentData[];
}

async function main() {
  console.log('========================================');
  console.log('  学生学习状态抓取工具');
  console.log('========================================\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  const collected: CollectedData = {
    collectedAt: new Date().toISOString(),
    teacherUsername: TEACHER_USERNAME,
    memberInfo: null,
    classroom: null,
    students: []
  };

  const apiResponses: Record<string, any> = {};
  page.on('response', async (response: Response) => {
    const url = response.url();
    try {
      if (url.includes('/api/kids/tokens') && !url.includes('sign-out') && response.status() === 200) {
        apiResponses.login = await response.json();
      }
      if (url.includes('/primary-reading') && response.status() === 200) {
        apiResponses.stats = await response.json();
      }
      if (url.includes('/self-paced/status') && response.status() === 200) {
        apiResponses.assignment = await response.json();
      }
    } catch {}
  });

  try {
    // 1. 访问首页
    console.log('1. 访问首页...');
    await page.goto('https://www.kidsa-z.com/ng/');
    await page.waitForTimeout(1500);

    // 2. 输入老师用户名
    console.log('2. 输入老师用户名...');
    const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
    await page.waitForSelector(inputSelector, { timeout: 10000 });
    await page.fill(inputSelector, TEACHER_USERNAME);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);

    // 3. 获取学生列表
    console.log('\n3. 获取班级和学生列表...');
    const memberResp = await page.request.post(`${BASE_URL}/ng/api/kids/member`, {
      data: { username: TEACHER_USERNAME }
    });
    collected.memberInfo = await memberResp.json();

    const classroomsResp = await page.request.post(`${BASE_URL}/ng/api/kids/member/classrooms`, {
      data: { username: TEACHER_USERNAME }
    });
    const classrooms = await classroomsResp.json();
    collected.classroom = classrooms[0];

    const allStudentsResp = await page.request.post(`${BASE_URL}/ng/api/kids/member/class-chart`, {
      data: { username: TEACHER_USERNAME, classroomId: collected.classroom.classroomId }
    });
    const allStudents = await allStudentsResp.json();

    console.log('   - 班级:', collected.classroom.classroomAlias);
    console.log('   - 学生数:', allStudents.length);

    // 4. 遍历每个学生
    for (let i = 0; i < allStudents.length; i++) {
      const student = allStudents[i];
      console.log(`\n━━━ 学生 ${i + 1}/${allStudents.length}: ${student.screenName} ━━━`);

      delete apiResponses.login;
      delete apiResponses.stats;
      delete apiResponses.assignment;

      try {
        // 4a. 回到班级页面
        if (i > 0) {
          console.log('   a. 回到班级页面...');
          await page.goto(`${BASE_URL}/ng/login/class-chart`);
          await page.waitForTimeout(2000);
        }

        // 4b. 点击学生
        console.log('   b. 点击学生...');
        try {
          await page.click(`text=${student.screenName}`, { timeout: 5000 });
        } catch {
          const allButtons = page.locator('button, [role="button"]');
          await allButtons.nth(i + 2).click();
        }
        await page.waitForTimeout(2000);

        // 4c. 获取密码类型
        console.log('   c. 获取密码类型...');
        const pwdTypeResp = await page.request.post(`${BASE_URL}/ng/api/kids/student/password-type`, {
          data: { studentId: student.studentId, username: TEACHER_USERNAME }
        });
        const passwordTypeResp = await pwdTypeResp.json();
        const passwordType = passwordTypeResp.passwordType;
        console.log('      密码类型:', passwordType);

        // 4d. 导航到登录页，等待密码图标加载
        console.log('   d. 等待密码页面...');
        await page.goto(`${BASE_URL}/ng/login/student`);
        await page.waitForTimeout(6000);

        // 4e. 点击密码图标
        console.log('   e. 点击密码图标...');
        let passwordClicked = false;
        try {
          const passwordButtons = page.locator('.password-icons__button');
          const count = await passwordButtons.count();
          if (count > 0) {
            await passwordButtons.first().click();
            passwordClicked = true;
          }
        } catch {}

        if (!passwordClicked) {
          const allButtons = page.locator('button, [role="button"]');
          const count = await allButtons.count();
          for (let j = 2; j < Math.min(count, 30); j++) {
            try {
              await allButtons.nth(j).click();
              await page.waitForTimeout(300);
              passwordClicked = true;
              break;
            } catch {}
          }
        }

        // 4f. 关键！等待登录自动执行（约 4-5 秒）
        console.log('   f. 等待登录...');
        await page.waitForTimeout(5000);

        // 4g. 访问 stats/reading 页面
        console.log('   g. 访问 stats/reading 页面...');
        await page.goto(`${BASE_URL}/ng/stats/reading`);
        await page.waitForTimeout(2000);

        // 4h. 获取数据
        console.log('   h. 获取数据...');

        let loginResult = null;
        if (apiResponses.login) {
          loginResult = {
            id: apiResponses.login.state?.user?.id,
            screenName: apiResponses.login.state?.user?.screenName,
            earnedStars: apiResponses.login.state?.user?.stars?.earnedStars,
            availableStars: apiResponses.login.state?.user?.stars?.availableStars
          };
        }

        let stats = apiResponses.stats;
        if (!stats) {
          try {
            const statsResp = await page.request.get(`${BASE_URL}/ng/api/kids/student/stats/primary-reading`);
            const text = await statsResp.text();
            if (text.startsWith('{')) stats = JSON.parse(text);
          } catch {}
        }

        let assignmentStatus = apiResponses.assignment;
        if (!assignmentStatus) {
          try {
            const assignResp = await page.request.get(`${BASE_URL}/ng/api/kids/student/reading/assignment/self-paced/status`);
            const text = await assignResp.text();
            if (text.startsWith('{')) assignmentStatus = JSON.parse(text);
          } catch {}
        }

        console.log('      登录:', loginResult?.screenName, '星星:', loginResult?.earnedStars);
        console.log('      统计:', stats);
        console.log('      进度:', assignmentStatus);

        // 4i. 登出
        console.log('   i. 登出...');
        try {
          await page.request.get(`${BASE_URL}/ng/api/kids/tokens/sign-out`);
        } catch {}
        await page.waitForTimeout(500);

        collected.students.push({
          student,
          passwordType,
          loginResult,
          stats,
          assignmentStatus
        });

        console.log('   ✓ 完成！');

      } catch (error) {
        console.error('   ✗ 失败:', error);
        try {
          await page.request.get(`${BASE_URL}/ng/api/kids/tokens/sign-out`);
          await page.waitForTimeout(500);
        } catch {}
      }

      ensureDataDir();
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collected, null, 2));
    }

    console.log('\n========================================');
    console.log('  全部完成！');
    console.log('========================================');
    console.log(`\n共收集 ${collected.students.length} 个学生数据`);
    console.log(`已保存到: ${OUTPUT_FILE}`);

    console.log('\n【数据摘要】');
    collected.students.forEach((s, idx) => {
      const level = s.assignmentStatus?.currentLevel?.name || '?';
      const stars = s.loginResult?.earnedStars || '?';
      console.log(`${idx + 1}. ${s.student.screenName} - ${stars} 星星 - 等级 ${level}`);
    });

    console.log('\n按回车键关闭浏览器...');
    await waitForEnter();

  } catch (error) {
    console.error('错误:', error);
    console.log('\n按回车键关闭浏览器...');
    await waitForEnter();
  } finally {
    await browser.close();
  }
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function waitForEnter(): Promise<void> {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

main().catch(console.error);
