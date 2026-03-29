---
wave: 1
depends_on: []
files_modified: ["package.json", "tsconfig.json"]
autonomous: true
---

# Plan 01: Initialize npm project and TypeScript config

## Tasks

<tasks>
<task>
<description>Initialize npm package.json</description>
<type>shell</type>
<command>npm init -y</command>
<file>package.json</file>
</task>

<task>
<description>Install TypeScript and dev dependencies</description>
<type>shell</type>
<command>npm install --save-dev typescript @types/node ts-node tsx</command>
<file>package.json</file>
</task>

<task>
<description>Create tsconfig.json</description>
<type>write</type>
<file>tsconfig.json</file>
<content><![CDATA[{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
]]></content>
</task>

<task>
<description>Create src directory</description>
<type>shell</type>
<command>mkdir -p src</command>
</task>
</tasks>

## Verification

- [ ] package.json exists
- [ ] tsconfig.json exists with strict mode enabled
- [ ] src directory exists
- [ ] TypeScript is installed as dev dependency

## must_haves

- package.json initialized
- TypeScript configured
- src directory structure created

## requirements

- SETUP-01: 项目初始化（package.json, tsconfig.json）
- SETUP-03: TypeScript 开发环境配置
