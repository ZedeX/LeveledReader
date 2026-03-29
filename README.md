# KidsA-Z Book Scraper

一个用于捕获和复用网站登录 cookies，并采集 KidsA-Z 书籍资源的 Playwright 工具。

## 功能

- 🚀 一键启动浏览器供你手动登录
- ⌨️ 按回车键快速保存登录 cookies
- 📦 保存的 cookies 可在后续自动化脚本中复用
- 📚 自动采集 ReadingBookRoom 中的书籍
- 🖼️ 采集封面、每页图片、文字内容
- 🔊 下载音频文件（支持每页多段音频）
- 💾 结构化保存，每本书一个文件夹

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

1. 在浏览器中导航到 https://www.kidsa-z.com/
2. 手动登录你的账户
3. 登录成功后，按 **Enter** 键保存 cookies
4. Cookies 会保存到项目根目录的 `cookies.json`
5. 按 **Ctrl+C** 退出程序

### 2. 复用 Cookies（验证登录）

```bash
npm run example
```

这会：
- 加载 `cookies.json` 中的 cookies
- 启动浏览器并自动设置 cookies
- 验证你是否已登录

### 3. 采集书籍

```bash
npm run scrape
```

这会：
- 加载 cookies 自动登录
- 访问 ReadingBookRoom 页面
- 解析书籍列表
- 逐本采集：
  - 封面图
  - 每一页截图
  - 每一页文字
  - 音频文件（支持每页多段）
- 保存到 `data/books/` 目录

## 项目结构

```
kids-a-z/
├── src/
│   ├── capture.ts          # Cookie 捕获脚本
│   ├── example.ts          # Cookie 复用示例
│   ├── scrape.ts           # 书籍采集主入口
│   ├── types.ts            # TypeScript 类型定义
│   └── scraper/
│       ├── index.ts        # 主爬虫逻辑
│       ├── browser.ts      # 浏览器控制
│       ├── parser.ts       # 页面解析
│       ├── downloader.ts   # 文件下载
│       └── storage.ts      # 数据存储
├── data/                   # 采集的数据（自动生成）
│   └── books/
│       └── {book-id}/
│           ├── info.json   # 书籍元数据
│           ├── cover.jpg   # 封面图
│           ├── pages/
│           │   ├── page-001.jpg
│           │   ├── page-001.txt
│           │   └── ...
│           └── audio/
│               ├── page-001-audio-001.mp3
│               └── ...
├── cookies.json            # 保存的 cookies（捕获后生成）
├── package.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## 书籍数据格式（info.json）

```json
{
  "id": "book-xxx",
  "title": "Book Title",
  "level": "L",
  "collectionId": "1",
  "url": "https://...",
  "coverImage": "cover.jpg",
  "pageCount": 10,
  "pages": [
    {
      "page": 1,
      "image": "pages/page-001.jpg",
      "text": "Page content...",
      "audioFiles": ["audio/page-001-audio-001.mp3"]
    }
  ],
  "audioFiles": ["..."],
  "collectedAt": "2026-03-29T..."
}
```

## NPM Scripts

| 命令 | 说明 |
|------|------|
| `npm run capture` | 启动浏览器捕获 cookies |
| `npm run example` | 运行示例脚本复用 cookies |
| `npm run scrape` | 运行书籍采集器 |
| `npm run build` | 编译 TypeScript |
| `npm run dev` | 同 `capture` |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Enter | 保存当前页面的 cookies |
| Ctrl+C | 退出程序 |

## 注意事项

- Cookies 包含敏感信息，请勿提交到版本控制
- `cookies.json` 和 `data/` 已在 `.gitignore` 中
- Cookies 可能会过期，过期后重新捕获即可
- 请合理使用，遵守网站 Terms of Service

## License

ISC
