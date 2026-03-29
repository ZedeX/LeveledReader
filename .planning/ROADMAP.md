# Roadmap: Playwright Cookie Capturer

**Created:** 2026-03-29
**Core Value:** 用户可以一次性手动登录，保存 cookies 后在自动化脚本中无限复用，避免每次自动化运行都需要重新登录。

## Phases

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 1 | Project Setup | 初始化 Node.js + TypeScript + Playwright 项目 | SETUP-01, SETUP-02, SETUP-03, DEV-02 | 4 |
| 2 | Cookie Capture | 实现浏览器启动和 F12 快捷键捕获 cookies | CAPT-01, CAPT-02, CAPT-03, CAPT-04 | 4 |
| 3 | Cookie Reuse | 实现 cookies 加载和复用示例 | REUSE-01, REUSE-02, REUSE-03 | 3 |
| 4 | Documentation | 完善使用文档 | DEV-01 | 1 |

**Total:** 4 phases | 12 requirements

---

## Phase Details

### Phase 1: Project Setup
**Goal:** 初始化 Node.js + TypeScript + Playwright 项目

**Requirements:**
- SETUP-01: 项目初始化（package.json, tsconfig.json）
- SETUP-02: Playwright 依赖安装和浏览器下载
- SETUP-03: TypeScript 开发环境配置
- DEV-02: npm scripts 简化常用操作

**Success Criteria:**
1. `npm install` 成功安装所有依赖
2. `npx playwright install` 成功下载 Chromium
3. `npm run build` 成功编译 TypeScript
4. 项目目录结构清晰，符合 TypeScript 最佳实践

---

### Phase 2: Cookie Capture
**Goal:** 实现浏览器启动和 F12 快捷键捕获 cookies

**Requirements:**
- CAPT-01: 启动非无头模式 Chromium 浏览器
- CAPT-02: 监听 F12 全局快捷键
- CAPT-03: 按 F12 时捕获当前页面所有 cookies
- CAPT-04: 将 cookies 保存为 cookies.json 文件

**Success Criteria:**
1. `npm run capture` 启动非无头浏览器
2. 浏览器显示空白页面或允许用户导航
3. 按 F12 键后，终端显示 "Cookies captured!"
4. 项目根目录生成 cookies.json，内容正确

---

### Phase 3: Cookie Reuse
**Goal:** 实现 cookies 加载和复用示例

**Requirements:**
- REUSE-01: 提供示例脚本展示如何加载 cookies
- REUSE-02: 加载 cookies 后自动设置到浏览器上下文
- REUSE-03: 验证 cookies 有效（页面显示登录状态）

**Success Criteria:**
1. 存在 example.ts 示例脚本
2. `npm run example` 成功运行
3. 浏览器加载 cookies.json 中的 cookies
4. 访问需登录页面显示已登录状态

---

### Phase 4: Documentation
**Goal:** 完善使用文档

**Requirements:**
- DEV-01: 清晰的 README 使用说明

**Success Criteria:**
1. README.md 存在于项目根目录
2. 包含安装步骤：npm install, npx playwright install
3. 包含使用步骤：如何捕获 cookies，如何复用 cookies
4. 包含快捷键说明和 cookies.json 格式说明

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Pending |
| SETUP-02 | Phase 1 | Pending |
| SETUP-03 | Phase 1 | Pending |
| DEV-02 | Phase 1 | Pending |
| CAPT-01 | Phase 2 | Pending |
| CAPT-02 | Phase 2 | Pending |
| CAPT-03 | Phase 2 | Pending |
| CAPT-04 | Phase 2 | Pending |
| REUSE-01 | Phase 3 | Pending |
| REUSE-02 | Phase 3 | Pending |
| REUSE-03 | Phase 3 | Pending |
| DEV-01 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Roadmap created: 2026-03-29*
*Last updated: 2026-03-29 after initial creation*
