import { Page } from 'playwright';
import { StudentAccount } from './types';

const BASE = 'https://www.kidsa-z.com';

export interface ApiResponse {
  status: number;
  body: string;
  json: any;
}

export class Auth {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async login(account: StudentAccount): Promise<boolean> {
    const { className, studentId, passwordArray } = account;

    console.log(`[Auth] 登录 ${className}/${studentId} (${account.screenName})`);

    await this.page.goto(`${BASE}/ng/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await this.waitForCloudflare();

    const inputFilled = await this.fillUsername(className);
    if (!inputFilled) throw new Error('无法找到用户名输入框');

    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(5000);

    const classrooms = await this.browserFetch('POST', `${BASE}/ng/api/kids/member/classrooms`, { username: className });
    const classroomId = classrooms.json?.[0]?.classroomId;
    if (!classroomId) throw new Error('获取classroom失败');

    const chart = await this.browserFetch('POST', `${BASE}/ng/api/kids/member/class-chart`, { username: className, classroomId });
    const student = chart.json?.find((s: any) => s.studentId === studentId);
    if (!student) throw new Error(`学生 ${studentId} 不在此班级`);

    await this.browserFetch('POST', `${BASE}/ng/api/kids/student/class-chart`, { username: className, studentId });
    await this.browserFetch('POST', `${BASE}/ng/api/kids/student/password-type`, { studentId, username: className });

    const loginResult = await this.browserFetch('POST', `${BASE}/ng/api/kids/tokens`, {
      studentId,
      username: className,
      iconicPassword: passwordArray
    });

    if (loginResult.json?.state?.accessGranted !== true) {
      throw new Error('登录失败: accessGranted != true');
    }

    console.log(`[Auth] ✓ 登录成功: ${student.screenName}`);
    return true;
  }

  async visitStatsPage(): Promise<void> {
    console.log('[Auth] 访问 stats/reading ...');
    await this.page.goto(`${BASE}/ng/stats/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await this.page.waitForTimeout(3000);
    console.log('[Auth] ✓ stats页面已访问');
  }

  async visitStudentPortal(): Promise<void> {
    console.log('[Auth] 访问 student-portal/reading ...');
    await this.page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await this.page.waitForTimeout(8000);
    console.log('[Auth] ✓ student-portal页面已访问');
  }

  async enterReadingRoom(): Promise<void> {
    console.log('[Auth] 进入 Reading Room ...');
    await this.page.goto(`${BASE}/ng/student-portal/reading`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    await this.page.waitForTimeout(10000);

    const rrLocator = this.page.getByText('Reading Room', { exact: true });
    const count = await rrLocator.count();
    if (count === 0) throw new Error('未找到 Reading Room 按钮');

    await rrLocator.first().scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(500);
    await rrLocator.first().click({ timeout: 10000 });
    console.log('[Auth] ✓ 已点击 Reading Room');

    await this.page.waitForTimeout(5000);
    try { await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}); } catch {}

    for (let i = 0; i < 20; i++) {
      const imgCount = await this.page.evaluate(() =>
        document.querySelectorAll('img[src*="resource-cards"]').length
      );
      if (imgCount > 3) {
        console.log(`[Auth] ✓ 书籍已加载 (${imgCount}张封面)`);
        return;
      }
      await this.page.waitForTimeout(2000);
    }
    console.log('[Auth] ⚠ 超时等待书籍加载，继续执行');
  }

  async browserFetch(method: string, url: string, body?: any): Promise<ApiResponse> {
    return this.page.evaluate(async ({ meth, u, b }) => {
      const csrfToken = document.cookie
        .split(';')
        .find(c => c.trim().startsWith('XSRF-TOKEN='))
        ?.split('=')
        .slice(1)
        .join('=') || '';

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrfToken);

      const o: RequestInit = { method: meth, credentials: 'include', headers };
      if (b != null && meth === 'POST') o.body = JSON.stringify(b);

      const r = await fetch(u, o);
      const t = await r.text();
      let j = null;
      try { j = JSON.parse(t); } catch {}

      return { status: r.status, body: t.substring(0, 500000), json: j };
    }, { meth: method, u: url, b: body });
  }

  private async fillUsername(username: string): Promise<boolean> {
    for (let i = 0; i < 6; i++) {
      for (const sel of ['input[type="text"]', 'input[name="username"]', 'input']) {
        try {
          const el = this.page.locator(sel).first();
          if (await el.isVisible({ timeout: 2000 })) {
            await el.fill(username);
            return true;
          }
        } catch {}
      }
      if (i < 5) await this.page.waitForTimeout(5000);
    }
    return false;
  }

  private async waitForCloudflare(): Promise<void> {
    console.log('[Auth] 等待Cloudflare验证...');
    await this.page.waitForTimeout(5000);

    for (let i = 0; i < 12; i++) {
      const hasInput = await this.page.evaluate(() => {
        return !!document.querySelector('input[type="text"], input[name="username"]');
      });
      if (hasInput) {
        console.log('[Auth] ✓ Cloudflare通过');
        return;
      }
      await this.page.waitForTimeout(5000);
    }
    throw new Error('Cloudflare验证超时');
  }
}
