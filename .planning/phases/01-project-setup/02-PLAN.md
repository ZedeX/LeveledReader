---
wave: 2
depends_on: ["01-PLAN.md"]
files_modified: ["package.json"]
autonomous: true
---

# Plan 02: Install Playwright and browsers

## Tasks

<tasks>
<task>
<description>Install Playwright</description>
<type>shell</type>
<command>npm install --save-dev playwright @playwright/test</command>
<file>package.json</file>
</task>

<task>
<description>Install Playwright Chromium browser</description>
<type>shell</type>
<command>npx playwright install chromium</command>
</task>

<task>
<description>Add npm scripts to package.json</description>
<type>edit</type>
<file>package.json</file>
<field>scripts</field>
<content><![CDATA[{
  "dev": "tsx src/capture.ts",
  "build": "tsc",
  "capture": "tsx src/capture.ts",
  "example": "tsx src/example.ts"
}]]></content>
</task>
</tasks>

## Verification

- [ ] Playwright is in package.json devDependencies
- [ ] Chromium browser installed
- [ ] npm scripts exist: dev, build, capture, example

## must_haves

- Playwright installed
- Chromium browser downloaded
- npm scripts configured

## requirements

- SETUP-02: Playwright 依赖安装和浏览器下载
- DEV-02: npm scripts 简化常用操作
