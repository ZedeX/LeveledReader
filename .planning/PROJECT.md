# Playwright Cookie Capturer

## What This Is

一个 Playwright 工具，用于在浏览器中手动登录网站后，通过快捷键捕获登录 cookies 并保存为 JSON 文件。保存的 cookies 可在后续的 Playwright 自动化脚本中复用，实现免登录批量操作。

## Core Value

用户可以一次性手动登录，保存 cookies 后在自动化脚本中无限复用，避免每次自动化运行都需要重新登录。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 安装并配置 Playwright（Chromium 浏览器）
- [ ] 启动非无头模式浏览器供用户手动操作
- [ ] 监听 F12 快捷键触发 cookie 捕获
- [ ] 将捕获的 cookies 保存为 cookies.json 文件
- [ ] 提供示例脚本展示如何加载 cookies 复用登录状态

### Out of Scope

- 多账户 cookie 管理（单个 cookies.json 足够）
- cookie 自动刷新（手动重新捕获即可）
- 加密存储 cookies（本地使用，安全性由用户负责）

## Context

这是一个工具类项目，主要用于个人自动化工作流。技术栈：Node.js + TypeScript + Playwright。

## Constraints

- **Tech stack**: Node.js (TypeScript) — Playwright 生态最成熟
- **Browser**: Chromium — Playwright 默认，兼容性好
- **Shortcut**: F12 — 单键，易于触发

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript | 类型安全，更好的开发体验 | — Pending |
| F12 快捷键 | 单键易按，不与常用快捷键冲突 | — Pending |
| cookies.json 存储 | 简单直接，易于调试和复用 | — Pending |

---
*Last updated: 2026-03-29 after initialization*
