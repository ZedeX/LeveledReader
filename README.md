# Playwright Cookie Capturer

一个用于捕获和复用网站登录 cookies 的 Playwright 工具。

## 功能

- 🚀 一键启动浏览器供你手动登录
- ⌨️ 按 F12 键快速保存登录 cookies
- 📦 保存的 cookies 可在后续自动化脚本中复用
- 💡 提供完整的示例代码

## 安装

```bash
# 安装依赖
npm install

# 下载 Playwright Chromium 浏览器
npx playwright install chromium
```

## 使用方法

### 1. 捕获 Cookies

```bash
npm run capture
```

这会打开一个非无头模式的 Chromium 浏览器：

1. 在浏览器中导航到目标网站
2. 手动登录你的账户
3. 登录成功后，按 **F12** 键保存 cookies
4. Cookies 会保存到项目根目录的 `cookies.json`
5. 按 **Ctrl+C** 退出程序

### 2. 复用 Cookies

```bash
npm run example
```

这会：
- 加载 `cookies.json` 中的 cookies
- 启动浏览器并自动设置 cookies
- 自动导航到发现的域名
- 你应该会看到已登录状态

## 项目结构

```
kids-a-z/
├── src/
│   ├── capture.ts      # Cookie 捕获脚本
│   └── example.ts      # Cookie 复用示例
├── cookies.json        # 保存的 cookies（捕获后生成）
├── package.json
├── tsconfig.json
└── README.md
```

## 在你自己的脚本中使用 Cookies

```typescript
import { chromium, Cookie } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const COOKIES_FILE = path.join(process.cwd(), 'cookies.json');

async function myAutomation() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();

  // 加载并设置 cookies
  const cookies: Cookie[] = JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf-8'));
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto('https://your-target-site.com');

  // 这里你已经是登录状态了！
  // 继续你的自动化操作...
}
```

## NPM Scripts

| 命令 | 说明 |
|------|------|
| `npm run capture` | 启动浏览器捕获 cookies |
| `npm run example` | 运行示例脚本复用 cookies |
| `npm run build` | 编译 TypeScript |
| `npm run dev` | 同 `capture` |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| F12 | 保存当前页面的 cookies |
| Ctrl+C | 退出程序 |

## 注意事项

- Cookies 包含敏感信息，请勿提交到版本控制
- 建议将 `cookies.json` 添加到 `.gitignore`
- Cookies 可能会过期，过期后重新捕获即可

## License

ISC
