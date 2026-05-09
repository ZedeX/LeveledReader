# Kids A-Z 登录流程经验总结

## 问题回顾

最初尝试抓取学生数据时，在密码登录环节反复失败，原因如下：

### 关键发现

#### 1. **API 调用顺序很重要**
```
错误做法：
  → POST /member/classrooms
  → POST /member/class-chart (选择学生)
  → POST /student/password-type
  → POST /tokens (直接登录) ❌ 失败

正确做法：
  → POST /member/classrooms
  → POST /member/class-chart (选择学生)
  → POST /student/password-type
  → 导航到 /ng/login/student 页面 ✓
  → 等待密码图标加载 (约 6 秒) ✓
  → POST /tokens (登录) ✓ 成功
```

#### 2. **登录后必须先访问 stats 页面**
```
错误做法：
  登录成功 → 直接调用 /primary-reading API ❌ 返回 HTML 而非 JSON

正确做法：
  登录成功 → 先访问 /ng/stats/reading 页面 ✓
            → 再调用 API ✓ 成功
```

#### 3. **密码页面需要两步操作**
```
1. 点击密码图标 (第一个: .password-icons__button)
2. 点击提交按钮 / 按 Enter 键
```

## 完整正确流程

### 步骤 1: 初始化
```typescript
// 访问首页
await page.goto('https://www.kidsa-z.com/ng/');

// 输入老师用户名
await page.fill('input[type="text"]', 'msummer17');
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
```

### 步骤 2: 获取初始数据
```typescript
// 获取班级
await page.request.post('/ng/api/kids/member/classrooms', {
  data: { username: 'msummer17' }
});

// 获取学生列表
const allStudents = await page.request.post('/ng/api/kids/member/class-chart', {
  data: { username: 'msummer17', classroomId }
});
```

### 步骤 3: 单个学生处理 (关键!)
```typescript
// a. 选择学生
await page.request.post('/ng/api/kids/student/class-chart', {
  data: { username: 'msummer17', studentId }
});

// b. 获取密码类型
await page.request.post('/ng/api/kids/student/password-type', {
  data: { studentId, username: 'msummer17' }
});

// c. 关键！导航到登录页并等待密码图标加载
await page.goto('https://www.kidsa-z.com/ng/login/student');
await page.waitForTimeout(6000);  // 等待 6 秒！

// d. 点击密码图标
await page.locator('.password-icons__button').first().click();

// e. 点击提交 / 按 Enter
await page.keyboard.press('Enter');
await page.waitForTimeout(5000);
```

### 步骤 4: 获取学生数据 (关键!)
```typescript
// 关键！先访问 stats/reading 页面
await page.goto('https://www.kidsa-z.com/ng/stats/reading');
await page.waitForTimeout(2000);

// 然后才能获取统计数据
const stats = await page.request.get('/ng/api/kids/student/stats/primary-reading');
const assignment = await page.request.get('/ng/api/kids/student/reading/assignment/self-paced/status');

// 登出
await page.request.get('/ng/api/kids/tokens/sign-out');
```

## 经验教训

1. **不要跳过页面导航** - 即使有 API，有些页面导航是必须的（建立 session、加载资源等）
2. **等待时间很重要** - 密码图标加载需要约 6 秒
3. **登录后先导航到目标页面** - 不要直接调用 API
4. **监听真实用户操作** - 用拦截脚本记录真实流程最可靠

## 调试技巧

当遇到类似问题时：
1. 写拦截脚本记录真实用户操作
2. 对比自动化和真实操作的差异
3. 检查 API 请求的 Referer、header 等细节
4. 注意页面导航顺序和等待时间
