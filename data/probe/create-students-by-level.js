const fs = require('fs');
const path = require('path');

const LEVEL_ORDER = ['aa','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','Z1','Z2'];

function levelSortKey(level) {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 999 : i;
}

// Read probe-results.json
const probeResultsPath = path.join(__dirname, 'probe-results.json');
const probeResults = JSON.parse(fs.readFileSync(probeResultsPath, 'utf-8'));

// Filter successful logins and sort by currentLevel
const successfulStudents = probeResults
  .filter(s => s.loginStatus === 'success' && s.assignmentStatus?.currentLevel)
  .sort((a, b) => levelSortKey(a.assignmentStatus.currentLevel) - levelSortKey(b.assignmentStatus.currentLevel));

// Create sorted list
const sortedStudents = successfulStudents.map(s => ({
  teacher: s.className,
  student: s.screenName,
  password: s.passwordNames.join(','),
  currentLevel: s.assignmentStatus.currentLevel,
  nextLevel: s.assignmentStatus.nextLevel,
  studentId: s.studentId,
  earnedStars: s.earnedStars
}));

// Output to file
const outputPath = path.join(__dirname, 'students-by-level.json');
fs.writeFileSync(outputPath, JSON.stringify(sortedStudents, null, 2), 'utf-8');

console.log(`Created: ${outputPath}`);
console.log(`Total students: ${sortedStudents.length}`);
console.log('\nBy Level:');
const levelCounts = {};
sortedStudents.forEach(s => {
  levelCounts[s.currentLevel] = (levelCounts[s.currentLevel] || 0) + 1;
});
LEVEL_ORDER.forEach(l => {
  if (levelCounts[l]) {
    console.log(`  ${l}: ${levelCounts[l]} students`);
  }
});

// Also create a simple text version
const txtPath = path.join(__dirname, 'students-by-level.txt');
let txt = '# Students sorted by currentLevel\n';
txt += '# Format: teacher,student,password,currentLevel\n\n';
sortedStudents.forEach(s => {
  txt += `${s.teacher},${s.student},${s.password},${s.currentLevel}\n`;
});
fs.writeFileSync(txtPath, txt, 'utf-8');
console.log(`\nAlso created: ${txtPath}`);
