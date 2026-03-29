import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'cookies.json');

console.log('========================================');
console.log('  Playwright Cookie Capturer');
console.log('========================================');
console.log('');
console.log('浏览器即将启动...');
console.log('');
console.log('使用说明:');
console.log('  1. 在打开的浏览器中导航到目标网站');
console.log('  2. 手动登录你的账户');
console.log('  3. 登录成功后，按回车键保存 cookies');
console.log('  4. 按 Ctrl+C 退出程序');
console.log('');

async function main() {
  // 启动浏览器
  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  // 导航到空白页
  await page.goto('about:blank');

  console.log('✓ 浏览器已启动！');
  console.log('');

  // 监听标准输入
  process.stdin.setEncoding('utf8');

  process.stdin.on('data', async (data) => {
    const input = data.toString().trim();

    // 用户按了回车键
    if (input === '' || input === '\n' || input === '\r\n') {
      console.log('');
      console.log('► 正在捕获 cookies...');

      try {
        const cookies = await context.cookies();

        // 保存到文件
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));

        console.log(`✓ Cookies 已保存到: ${COOKIES_FILE}`);
        console.log(`  共 ${cookies.length} 个 cookies`);
        console.log('');
        console.log('按回车键再次保存，或按 Ctrl+C 退出');
      } catch (error) {
        console.error('✗ 保存 cookies 时出错:', error);
      }
    }
  });

  // Ctrl+C 退出
  process.on('SIGINT', async () => {
    console.log('');
    console.log('正在关闭浏览器...');
    await browser.close();
    process.exit(0);
  });
}

main().catch(console.error);
