# Requirements: Playwright Cookie Capturer

**Defined:** 2026-03-29
**Core Value:** 用户可以一次性手动登录，保存 cookies 后在自动化脚本中无限复用，避免每次自动化运行都需要重新登录。

## v1 Requirements

### Setup
- [x] **SETUP-01**: 项目初始化（package.json, tsconfig.json）
- [x] **SETUP-02**: Playwright 依赖安装和浏览器下载
- [x] **SETUP-03**: TypeScript 开发环境配置

### Cookie Capture
- [x] **CAPT-01**: 启动非无头模式 Chromium 浏览器
- [x] **CAPT-02**: 监听 F12 全局快捷键
- [x] **CAPT-03**: 按 F12 时捕获当前页面所有 cookies
- [x] **CAPT-04**: 将 cookies 保存为 cookies.json 文件

### Cookie Reuse
- [x] **REUSE-01**: 提供示例脚本展示如何加载 cookies
- [x] **REUSE-02**: 加载 cookies 后自动设置到浏览器上下文
- [x] **REUSE-03**: 验证 cookies 有效（页面显示登录状态）

### Developer Experience
- [x] **DEV-01**: 清晰的 README 使用说明
- [x] **DEV-02**: npm scripts 简化常用操作

## v2 Requirements

### Advanced Features
- **ADV-01**: 支持多个 cookie profiles（多账户）
- **ADV-02**: cookie 过期检测和提醒
- **ADV-03**: 支持其他浏览器（Firefox, WebKit）

## Out of Scope

| Feature | Reason |
|---------|--------|
| Cookie 加密存储 | 本地使用，用户负责安全 |
| 自动登录流程 | 手动登录是核心设计 |
| Cookie 服务器同步 | 仅本地使用 |
| GUI 界面 | CLI 工具足够 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | ✓ Complete |
| SETUP-02 | Phase 1 | ✓ Complete |
| SETUP-03 | Phase 1 | ✓ Complete |
| DEV-02 | Phase 1 | ✓ Complete |
| CAPT-01 | Phase 2 | ✓ Complete |
| CAPT-02 | Phase 2 | ✓ Complete |
| CAPT-03 | Phase 2 | ✓ Complete |
| CAPT-04 | Phase 2 | ✓ Complete |
| REUSE-01 | Phase 3 | ✓ Complete |
| REUSE-02 | Phase 3 | ✓ Complete |
| REUSE-03 | Phase 3 | ✓ Complete |
| DEV-01 | Phase 4 | ✓ Complete |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after project completion*
