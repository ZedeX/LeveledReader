// 脱敏probe-results.json中的敏感数据
import * as fs from 'fs';
import * as path from 'path';

const inputPath = path.resolve(__dirname, '../data/probe/probe-results.json');
const outputPath = path.resolve(__dirname, '../data/probe/probe-results.public.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

// 脱敏处理
const sanitized = data.map((s: any) => ({
  className: s.className,
  studentId: s.studentId,
  screenName: s.screenName,
  // 密码脱敏为占位符
  passwordNames: ['***', '***'],
  loginStatus: s.loginStatus,
  assignmentStatus: s.assignmentStatus ? {
    currentLevel: s.assignmentStatus.currentLevel,
    levelUpBooks: s.assignmentStatus.levelUpBooks,
    readingRoomBooks: s.assignmentStatus.readingRoomBooks,
  } : undefined,
}));

fs.writeFileSync(outputPath, JSON.stringify(sanitized, null, 2), 'utf-8');
console.log(`已脱敏保存到: ${outputPath}`);
console.log(`原文件保留: ${inputPath} (已在.gitignore中排除)`);
