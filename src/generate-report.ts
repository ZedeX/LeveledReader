import * as fs from 'fs';
import * as path from 'path';

const results = JSON.parse(fs.readFileSync('data/probe/probe-results.json', 'utf-8'));

const header = 'className,studentId,screenName,password,passwordNames,earnedStars,readThisWeekCount,listenCount,readCount,quizCount,worksheetCount,currentLevel,probeAttempts,probeTimestamp';

const rows = results.map((r: any) => [
  r.className,
  r.studentId,
  `"${r.screenName}"`,
  r.passwordCombination.join('-'),
  `"${r.passwordNames.join('-')}"`,
  r.earnedStars || 0,
  r.readingStats?.readThisWeekCount || 0,
  r.readingStats?.listenCount || 0,
  r.readingStats?.readCount || 0,
  r.readingStats?.quizCount || 0,
  r.readingStats?.worksheetCount || 0,
  `"${r.assignmentStatus?.currentLevel || ''}"`,
  r.probeAttempts,
  r.probeTimestamp,
].join(','));

fs.writeFileSync('data/probe/probe-results.csv', header + '\n' + rows.join('\n'));
console.log(`CSV updated with ${results.length} rows`);

const byClass: Record<string, number> = {};
for (const r of results) {
  byClass[r.className] = (byClass[r.className] || 0) + 1;
}

console.log('\nSummary by class:');
for (const [cls, count] of Object.entries(byClass).sort()) {
  console.log(`  ${cls}: ${count} students`);
}

const totalStars = results.reduce((sum: number, r: any) => sum + (r.earnedStars || 0), 0);
console.log(`\nTotal students: ${results.length}`);
console.log(`Total earned stars: ${totalStars}`);
console.log(`Average stars per student: ${Math.round(totalStars / results.length)}`);

const passwordLengths: Record<string, number> = {};
for (const r of results) {
  const len = r.passwordCombination.length + 'digit';
  passwordLengths[len] = (passwordLengths[len] || 0) + 1;
}
console.log('\nPassword length distribution:');
for (const [len, count] of Object.entries(passwordLengths).sort()) {
  console.log(`  ${len}: ${count} students (${Math.round(count / results.length * 100)}%)`);
}
