import json
import csv

# 读取JSON文件
with open('probe-results.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 定义CSV列名（覆盖所有可能的字段）
csv_columns = [
    'className', 'studentId', 'screenName', 'passwordCombination', 'passwordNames',
    'loginStatus', 'earnedStars', 'readThisWeekCount', 'readLastWeekCount',
    'listenCount', 'readCount', 'quizCount', 'worksheetCount', 'currentLevel',
    'completedTasks', 'remainingTasks', 'nextLevel', 'probeTimestamp', 'probeAttempts'
]

# 写入CSV文件
with open('probe-results.csv', 'w', newline='', encoding='utf-8') as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=csv_columns)
    writer.writeheader()
    
    for item in data:
        # 初始化行数据，默认空值
        row = {col: '' for col in csv_columns}
        
        # 基础字段
        for key in ['className', 'studentId', 'screenName', 'passwordCombination', 
                    'passwordNames', 'loginStatus', 'earnedStars', 'probeTimestamp', 'probeAttempts']:
            if key in item:
                # 处理数组类型（转字符串）
                if isinstance(item[key], list):
                    row[key] = ', '.join(map(str, item[key]))
                else:
                    row[key] = item[key]
        
        # 嵌套的readingStats字段
        if 'readingStats' in item and item['readingStats']:
            for key in ['readThisWeekCount', 'readLastWeekCount', 'listenCount', 
                        'readCount', 'quizCount', 'worksheetCount']:
                if key in item['readingStats']:
                    row[key] = item['readingStats'][key]
        
        # 嵌套的assignmentStatus字段
        if 'assignmentStatus' in item and item['assignmentStatus']:
            for key in ['currentLevel', 'completedTasks', 'remainingTasks', 'nextLevel']:
                if key in item['assignmentStatus']:
                    row[key] = item['assignmentStatus'][key]
        
        writer.writerow(row)

print("JSON已成功转换为CSV，文件名为：probe-results.csv")