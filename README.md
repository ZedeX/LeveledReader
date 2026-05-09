# KidsA-Z Student Data Scraper

KidsA-Z 学生数据抓取工具，用于批量获取学生学习数据和密码探测。

## 功能特性

- 学生密码自动探测（支持1位、2位、3位密码组合）
- 多班级批量处理
- 学习进度数据抓取（阅读统计、任务状态、星星数量）
- 并行处理与速率限制处理
- 进度实时监控

## 安装

```bash
npm install
npx playwright install chromium
```

## 使用方法

### 1. 获取班级学生列表

```bash
npx tsx src/fetch-all-class-students.ts
```

输出: `data/probe/all-class-students.json`

### 2. 密码探测

```bash
# 探测所有班级
npx tsx src/probe-multi-class.ts

# 重试失败的学生（3位密码）
npx tsx src/retry-failed-3digit.ts
```

输出:
- `data/probe/probe-results.json` - 成功结果
- `data/probe/probe-failed.json` - 失败记录
- `data/probe/probe-live.json` - 实时进度

### 3. 检查进度

```bash
npx tsx src/check-progress.ts
```

### 4. 补充缺失数据

```bash
npx tsx src/fetch-missing-data.ts
```

### 5. 生成报告

```bash
npx tsx src/generate-report.ts
```

输出: `data/probe/probe-results.csv`

## 密码图标对照表

| ID | 图标 | ID | 图标 | ID | 图标 |
|----|------|----|------|----|------|
| 1 | rabbit | 7 | dog | 13 | strawberry |
| 2 | duck | 8 | truck | 14 | apple |
| 3 | fish | 9 | rocket | 15 | carrot |
| 4 | lizard | 10 | train | 16 | banana |
| 5 | turtle | 11 | plane | 17 | watermelon |
| 6 | cat | 12 | boat | 18 | spoon |

## 项目结构

```
kids-a-z/
├── src/
│   ├── probe/
│   │   ├── combinations.ts    # 密码组合生成
│   │   ├── prober.ts          # 探测引擎
│   │   └── types.ts           # 类型定义
│   ├── probe-multi-class.ts   # 多班级探测入口
│   ├── retry-failed-3digit.ts # 3位密码重试
│   ├── fetch-all-class-students.ts  # 获取学生列表
│   ├── fetch-missing-data.ts  # 补充缺失数据
│   ├── check-progress.ts      # 进度检查
│   ├── generate-report.ts     # 生成CSV报告
│   └── clean-failed.ts        # 清理失败记录
├── data/
│   └── probe/
│       ├── all-class-students.json  # 学生列表
│       ├── probe-results.json       # 探测结果
│       ├── probe-results.csv        # CSV报告
│       ├── probe-failed.json        # 失败记录
│       └── probe-live.json          # 实时状态
├── zx-pics/                   # 密码图标截图
├── package.json
├── tsconfig.json
└── README.md
```

## 输出数据格式

### probe-results.csv

| 字段 | 说明 |
|------|------|
| className | 班级名称 |
| studentId | 学生ID |
| screenName | 显示名称 |
| password | 密码组合（如 8-12） |
| passwordNames | 密码图标名称（如 truck-boat） |
| earnedStars | 获得星星数 |
| readThisWeekCount | 本周阅读数 |
| listenCount | 听书次数 |
| readCount | 阅读次数 |
| quizCount | 测验次数 |
| currentLevel | 当前级别 |
| probeAttempts | 探测尝试次数 |
| probeTimestamp | 探测时间 |

## 注意事项

- 密码组合为无序（1-2-3 等同于 3-2-1）
- API 有速率限制（10次/窗口），脚本已自动处理
- 建议使用 headless 模式后台运行
- 同名学生需通过 studentId 区分

## License

ISC
