import * as fs from 'fs';
import * as path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'intercepted-data.json');

interface InterceptedData {
  requests: Array<{
    id: string;
    timestamp: string;
    type: 'request' | 'response';
    url: string;
    method?: string;
    requestBody?: string;
    responseBody?: string;
  }>;
}

function main() {
  const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
  const data: InterceptedData = JSON.parse(rawData);

  // 找 class-chart 的响应
  const classChartResponses = data.requests
    .filter(r => r.type === 'response' && r.url.includes('/api/kids/student/class-chart') && r.responseBody)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  console.log('【class-chart 响应分析】\n');

  for (const resp of classChartResponses) {
    const req = data.requests.find(r => r.type === 'request' && r.url === resp.url && r.method);

    console.log(`时间: ${resp.timestamp}`);
    if (req) {
      console.log(`请求: ${req.method} ${req.requestBody || '(无body)'}`);
    }
    try {
      const json = JSON.parse(resp.responseBody!);
      if (Array.isArray(json)) {
        console.log(`响应: 数组，${json.length} 个学生`);
        console.log('前3个学生:');
        json.slice(0, 3).forEach((s: any, i: number) => {
          console.log(`  ${i + 1}. ${s.screenName} (${s.studentId})`);
        });
      } else {
        console.log(`响应: 单个学生 - ${json.screenName} (${json.studentId})`);
      }
    } catch (e) {
      console.log(`响应解析失败: ${resp.responseBody?.substring(0, 100)}`);
    }
    console.log('');
  }
}

main();
