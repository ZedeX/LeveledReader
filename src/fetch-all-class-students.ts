import { chromium } from 'playwright';
import { VALID_CLASSES, ClassStudents, Student } from './probe/types';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://www.kidsa-z.com';
const DATA_DIR = path.join(process.cwd(), 'data', 'probe');
const STUDENTS_FILE = path.join(DATA_DIR, 'all-class-students.json');

async function main() {
  console.log('=== Fetch All Class Students ===\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log('[1] Navigate and pass Cloudflare...');
  await page.goto(`${BASE_URL}/ng/`);
  await page.waitForTimeout(3000);

  const inputSelector = 'input[type="text"], input[name="username"], input[placeholder*="username" i], input[placeholder*="teacher" i]';
  await page.waitForSelector(inputSelector, { timeout: 15000 });
  await page.fill(inputSelector, VALID_CLASSES[0]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(4000);

  console.log('[2] Fetching all classes...\n');

  const results: ClassStudents[] = [];

  for (const className of VALID_CLASSES) {
    console.log(`  Fetching ${className}...`);

    try {
      let classrooms: any[] = [];
      try {
        const resp = await page.request.post(`${BASE_URL}/ng/api/kids/member/classrooms`, {
          data: { username: className }
        });
        classrooms = await resp.json();
      } catch (e) {
        console.log(`    Failed to get classrooms: ${e}`);
        continue;
      }

      if (!classrooms || classrooms.length === 0) {
        console.log(`    No classrooms found`);
        continue;
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
        continue;
      }

      const classData: ClassStudents = {
        className,
        classroomId: classroom.classroomId,
        memberId: classroom.memberId,
        fetchedAt: new Date().toISOString(),
        students
      };

      results.push(classData);
      console.log(`    ${className}: ${students.length} students`);

    } catch (e) {
      console.log(`    Error: ${e}`);
    }

    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  fs.writeFileSync(STUDENTS_FILE, JSON.stringify(results, null, 2));

  console.log(`\n[3] Summary:`);
  console.log(`  Classes: ${results.length}`);
  console.log(`  Total students: ${results.reduce((s, c) => s + c.students.length, 0)}`);
  for (const cls of results) {
    console.log(`  ${cls.className}: ${cls.students.length} students`);
  }
  console.log(`\n  Saved to: ${STUDENTS_FILE}`);

  await browser.close();
}

main().catch(console.error);
