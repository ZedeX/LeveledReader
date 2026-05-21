# KidsA-Z 资源URL规律手册

> 生成时间: 2026-05-20 | 基于Level K完整API数据 + 3本已下载书籍分析

---

## 1. 认证流程

### 1.1 登录步骤（Playwright必需）

```
1. GET https://www.kidsa-z.com/ng/  → 等待Cloudflare通过
2. 填写username(班级名) → POST /ng/api/kids/member/classrooms → 获取classroomId
3. POST /ng/api/kids/member/class-chart → 获取学生列表
4. POST /ng/api/kids/student/class-chart → 选择学生
5. POST /ng/api/kids/student/password-type → 获取密码类型
6. POST /ng/api/kids/tokens → iconicPassword登录 → accessGranted=true
7. GET /ng/stats/reading → 建立session
8. GET /ng/student-portal/reading → 点击"Reading Room"进入书架
```

### 1.2 关键点
- 需要CSRF Token: 从cookie `XSRF-TOKEN` 提取，请求头 `X-XSRF-TOKEN` 携带
- 所有API请求需 `credentials: 'include'` (携带cookie)
- Cloudflare验证需要真实浏览器环境（Playwright）
- 图标密码(iconicPassword) = 数字数组, 如 [1] 表示点击第1个图标

---

## 2. 书籍列表API

### 2.1 请求

```
GET https://www.kidsa-z.com/api/student-bookroom/processed-booklist-multiple?params=<encoded>
Headers: X-XSRF-TOKEN=<csrf>, Content-Type: application/json
Credentials: include
```

### 2.2 params参数结构

```json
[
  {"collectionId": 1, "level": "K", "themeId": 1},
  {"collectionId": 1, "level": "K", "themeId": 2},
  ...
  {"collectionId": 1, "level": "K", "themeId": 22}
]
```

- **level**: aa ~ Z2 (共29级)
- **themeId**: 1 ~ 22 (每个级别最多22个theme)
- 返回: 二维数组 `[[book1, book2, ...], [book3, ...], ...]`, 每个子数组对应一个theme

### 2.3 返回字段（单本书）

```typescript
interface BookAPIResponse {
  resource_id: number;          // 唯一书籍ID (如 398)
  title: string;                // 书名 (如 "Flying Kites")
  sortable_title: string;       // 排序用标题
  level: string;               // 级别 (如 "K")
  levelId: number;             // 级别数字ID (如 K=12)
  languageId: number;          // 语言ID (1=English)
  show_title: boolean;
  isDoubleStar: boolean;
  image: {
    cover_thumbnail:        { url, size, versionId, altText };
    medium_cover_thumbnail: { url, size, versionId, altText };  // size字段实际为"large_cover_thumbnail"
    large_cover_thumbnail:  { url, size, versionId, altText };
    large:                 { url, size, versionId, altText };
    xlarge:                { url, size, versionId, altText };
  };
  deliveries: {
    "1": { name:"listen", pages:[0,1,2,...], has_page_zero:true,  start_at:N };
    "2": { name:"read",   pages:[0,1,2,...],                       start_at:0 };
    "3": { name:"quiz",                                           start_at:1 };
  };
  decoration: { tag, shape, shape_text, ... };
}
```

**关键**: `content_id` 不在API返回中！需要从 `image.large.url` 的路径中提取。

---

## 3. 各资源URL模式

### 3.1 封面图片

| 规格 | URL模板 | 示例 | 格式 |
|------|---------|------|------|
| 小缩略图(190px) | `https://mi.content.kidsa-z.com/resource-cards/books/190/{content_id}.png` | `.../190/275.png` | PNG |
| 中缩略图(418px) | `https://mi.content.kidsa-z.com/resource-cards/books/418/{content_id}.png` | `.../418/275.png` | PNG |
| 大封面(350px) | `https://mi.content.kidsa-z.com/raz_book_covers/350/1/{content_id}.jpg` | `.../350/1/275.jpg` | JPG |

**推荐下载**: `large_cover_thumbnail` (JPG格式，质量最好)

**content_id来源**: 从 `image.large.url` 正则提取:
```
/readonly\/(\d+)\//  →  capture group 1 = content_id
```
例: `https://mi.content.kidsa-z.com/readonly/275/projectable/large/1/book/page-1.jpg` → content_id = **275**

### 3.2 页面图片

| 规格 | URL模板 | 示例 |
|------|---------|------|
| large | `https://mi.content.kidsa-z.com/readonly/{content_id}/projectable/large/1/book/page-{N}.jpg` | `.../275/projectable/large/1/book/page-3.jpg` |
| xlarge | `https://mi.content.kidsa-z.com/readonly/{content_id}/projectable/xlarge/1/book/page-{N}.jpg` | `.../275/projectable/xlarge/1/book/page-3.jpg` |

**页码规则**:
- N = deliveries["1"].pages 数组中的值（通常从0开始）
- page-0 = 封面/标题页, page-1 = 版权页, page-2+ = 正文页
- 文件名格式: `page-000.jpg`, `page-001.jpg`, ... (三位零填充)

**推荐下载**: `large` 规格（够用且文件较小）

**无需认证**: 图片CDN可直接HTTP访问（不需要cookie/session）

### 3.3 音频文件

#### 完整URL模式

```
https://mi.content.kidsa-z.com/audio/{content_id}/raz_{slug}_{theme}_{pageKey}_text.mp3
```

#### 参数说明

| 参数 | 来源 | 示例 | 说明 |
|------|------|------|------|
| content_id | image.large.url提取 | 275 | 同图片的content_id |
| slug | title转小写去特殊字符 | flyingkites | 见下方slug生成规则 |
| theme | 每书不同，需探测 | th03, lk03, lk11... | 见下方theme列表 |
| pageKey | "title" 或 "p{N}" | title, p3, p4... | title=书名音频, p3=第3页起 |

#### slug生成规则

```typescript
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')   // 去掉非字母数字空格
    .replace(/\s+/g, '')            // 去掉所有空格
    .substring(0, 40);               // 截断40字符
}

// "Flying Kites"     → "flyingkites"
// "Ratty Rats"       → "rattyrats"
// "Anna and the Magic Coat" → "annamagiccoat"
// "Leap! A Salmon's Story"  → "leapsalmonsstory"
```

#### theme列表（已知26个）

```
th01~th20  (theme系列, 20个)
lk01~lk20  (look系列, 20个)
```
**每本书只对应一个theme**, 需要探测确定。探测方法：遍历所有theme尝试HEAD `title_text.mp3`，返回200即命中。

#### 页码规则

| pageKey | 对应页面 | 说明 |
|---------|----------|------|
| `title` | 标题页 | 书名朗读音频 |
| `p3` | 第3页 | 正文从p3开始 |
| `p4` | 第4页 | |
| `p5` | 第5页 | |
| ... | ... | 直到连续2次404停止 |
| **不含** p0, p1, p2 | 前3页无文本音频 | 只有封面/版权 |

**实际观察**: Flying Kites有13页(pages 0-12), 音频有title + p3~p12 = 11个文件。Ratty Rats有19页, 音频有title + p3~p18 = 17个文件。

**无需认证**: 音频CDN可直接HTTP访问

### 3.4 文本内容

#### 数据结构

```typescript
interface TextEntry {
  page: number;      // 页码 (从3开始，与音频对应)
  content: string;   // 该页完整文本
}

// metadata.json中的text字段示例:
"text": [
  { "page": 3,  "content": "The Hoppers pressed their noses against the windowpane." },
  { "page": 4,  "content": "\"Look!\" said Bopper. \"The kids are flying kites!\"" },
  { "page": 5,  "content": "\"I wish we could fly a kite,\" said Lulu." },
  ...
]
```

#### 来源
- **非API返回**: 书籍列表API不包含文本数据
- **手动录入**: 当前项目中只有部分书籍(Flying Kites)有text字段
- **可能提取方式**: OCR页面图片 / 从原始Raz-Kids网站抓取（Listen模式下页面可能有文本层）

#### 前端高亮实现（app.js）

```javascript
function renderPageText(text) {
  const words = text.split(/(\s+)/).filter(w => w.trim());
  container.innerHTML = words.map((w, i) =>
    `<span class="word" data-index="${i}">${w}</span>`
  ).join('');
}

// AudioPlayer.timeupdate 中:
const wordIndex = Math.floor(pct * currentPageText.length);
// 按进度点亮当前单词 (.active)，上一个变灰 (.spoken)
```

**原理**: 按空格分词 → 每词一个span → audio timeupdate按比例高亮对应词

---

## 4. 元数据结构 (metadata.json)

### 完整Schema

```typescript
interface BookMetadata {
  // === 基础信息 ===
  resource_id: number;              // API的resource_id
  title: string;                    // 书名
  level: string;                    // 级别 (K)
  levelId: number;                  // 级别ID (12)

  // === API原始数据 ===
  deliveries: Record<string, Delivery>;  // listen/read/quiz完整信息

  // === 文件记录 ===
  cover_path: string | null;         // "cover.jpg"
  pages_count: number;               // 页数
  page_files: string[];              // ["page-000.jpg", "page-001.jpg", ...]
  downloaded_at: string;             // ISO时间戳

  // === 音频相关 (下载后填充) ===
  content_id?: number;              // CDN内容ID (从image URL提取)
  slug?: string;                    // URL友好的书名标识
  audio_theme?: string;             // 音频主题 (th03/lk11等)
  audio?: {
    baseUrl: string;                // "https://mi.content.kidsa-z.com/audio"
    theme: string;
    contentId: number;
    files: Array<{
      page: string | number;        // "title" | 3 | 4 | ...
      file: string;                 // "raz_flyingkites_th03_p3_text.mp3"
    }>;
  };

  // === 文本内容 (可选, 手动录入或OCR) ===
  text?: Array<{
    page: number;
    content: string;
  }>;
}
```

### 目录结构

```
data/downloads/level-{LEVEL}/{resource_id}-{sanitized-title}/
├── metadata.json          # 完整元数据
├── cover.jpg              # 封面图
├── pages/
│   ├── page-000.jpg
│   ├── page-001.jpg
│   └── ...
└── audio/                 # (可选)
    ├── raz_xxx_th03_title_text.mp3
    ├── raz_xxx_th03_p3_text.mp3
    └── ...
```

---

## 5. 完整下载管线设计

### 5.1 总体架构

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  认证登录    │───▶│  按级别获取书单   │───▶│  逐书下载资源    │
│ (Playwright) │    │ (BookAPI)        │    │ (封面+页+音频)   │
└─────────────┘    └──────────────────┘    └─────────────────┘
                                                        │
                   ┌──────────────────────────────────────┘
                   ▼
          ┌──────────────────┐
          │  生成metadata.json │
          └──────────────────┘
```

### 5.2 下载顺序（单本书）

```
Step 1: 提取 content_id (从 image.large.url 正则)
Step 2: 生成 slug (title → 小写→去特殊字符→去空格)
Step 3: 下载封面图 (large_cover_thumbnail URL)
Step 4: 下载页面图片 (page-0 ~ page-N, 用deliveries["1"].pages)
Step 5: 探测 theme (遍历26个theme HEAD title音频)
Step 6: 下载音频 (title + p3 ~ pN, 连续404停止)
Step 7: 写入 metadata.json
```

### 5.3 断点续传策略

- **级别级**: 记录 `lastCompletedLevel`, 跳过已完成级别
- **书籍级**: 检测 `metadata.json` 存在且包含audio字段 → 跳过
- **文件级**: 检测本地文件存在且大小合理 → 跳过单个文件
- **进度文件**: `data/downloads/progress.json`

### 5.4 级别列表（29级）

```
aa, A, B, C, D, E, F, G, H, I, J, K, L, M,
N, O, P, Q, R, S, T, U, V, W, X, Y, Z, Z1, Z2
```

### 5.5 关键发现总结

| 资源类型 | 需要认证 | URL规律 | 可预测性 |
|----------|---------|---------|----------|
| 书籍列表API | ✅ 必需 | 固定endpoint + level/themeId参数 | 完全可预测 |
| 封面图片 | ❌ 不需 | content_id直接拼接 | 完全可预测 |
| 页面图片 | ❌ 不需 | content_id + 页码 | 完全可预测(页码来自API) |
| 音频文件 | ❌ 不需 | content_id + slug + theme + 页码 | theme需探测(~26次HEAD) |
| 文本内容 | ❓ 未知 | 非API提供 | 需手动录入或OCR |

### 5.6 已知限制

1. **text文本**: 无法自动获取，需要OCR或手动录入
2. **theme探测**: 每本书需最多26次HTTP HEAD请求
3. **content_id**: 只能从已登录后的API数据中提取（image.large.url含此值）
4. **Z1/Z2级别**: book-api.ts的ALL_LEVELS未包含Z1/Z2，需扩展
