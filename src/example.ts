import { chromium, Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'cookies.json');

async function main() {
  console.log('========================================');
  console.log('  Playwright Cookie Reuse Example');
  console.log('========================================');
  console.log('');

  // 检查 cookies 文件是否存在
  if (!fs.existsSync(COOKIES_FILE)) {
    console.error(`✗ Cookies 文件不存在: ${COOKIES_FILE}`);
    console.error('  请先运行 "npm run capture" 捕获 cookies');
    process.exit(1);
  }

  // 读取 cookies
  console.log('► 正在加载 cookies...');
  const cookies: Cookie[] = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
  console.log(`✓ 已加载 ${cookies.length} 个 cookies`);
  console.log('');

  // 启动浏览器
  console.log('► 正在启动浏览器...');
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext();

  // 设置 cookies
  console.log('► 正在设置 cookies 到浏览器...');
  await context.addCookies(cookies);
  console.log('✓ Cookies 已设置');
  console.log('');

  const page = await context.newPage();

  // 尝试从 cookies 中找到域名并导航
  const domains = [...new Set(cookies.map(c => c.domain))];
  console.log(`发现的域名: ${domains.join(', ')}`);
  console.log('');

  // 如果有域名，尝试导航到第一个
  if (domains.length > 0) {
    const domain = domains[0].replace(/^\./, ''); // 去掉开头的点
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    console.log(`► 正在导航到: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      console.log('✓ 页面已加载，请检查是否已登录！');
    } catch (error) {
      console.log('⚠ 导航失败，请手动在浏览器中访问目标网站');
    }
  } else {
    console.log('未发现域名，请手动在浏览器中访问目标网站');
  }

  console.log('');
  console.log('========================================');
  console.log('  浏览器保持打开状态');
  console.log('  按 Ctrl+C 退出程序');
  console.log('========================================');

  // 保持程序运行
  process.stdin.resume();
  process.on('SIGINT', async () => {
    console.log('');
    console.log('正在关闭浏览器...');
    await browser.close();
    process.exit(0);
  });
}

main().catch(console.error);
