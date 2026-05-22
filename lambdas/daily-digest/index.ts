import { ScheduledEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const region = process.env.AWS_REGION || 'eu-central-1';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const sns = new SNSClient({ region });
const TASKS_TABLE = process.env.TASKS_TABLE || 'Tasks';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

interface Task {
  taskId: string;
  title: string;
  status: string;
  priority: string;
  deadline: string;
  assigneeId: string;
  assigneeName: string;
  teamId: string;
  teamName: string;
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  const today = new Date().toISOString().split('T')[0];
  console.log(`Daily digest for ${today}`);

  const result = await dynamo.send(
    new ScanCommand({
      TableName: TASKS_TABLE,
      FilterExpression: 'begins_with(deadline, :today) AND #s <> :done',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':today': today, ':done': 'DONE' },
    })
  );

  const tasks = (result.Items || []) as Task[];
  if (tasks.length === 0) {
    console.log('No tasks due today');
    return;
  }

  const byAssignee = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.assigneeId) continue;
    const existing = byAssignee.get(task.assigneeName) || [];
    existing.push(task);
    byAssignee.set(task.assigneeName, existing);
  }

  const lines = ['=== Mini-Jira Daily Digest ===', `Date: ${today}`, `Tasks due today: ${tasks.length}`, ''];

  for (const [assigneeName, assigneeTasks] of byAssignee) {
    lines.push(`${assigneeName}:`);
    for (const t of assigneeTasks) {
      lines.push(`  - [${t.priority}] ${t.title} (${t.status}) — Team: ${t.teamName}`);
    }
    lines.push('');
  }

  await sns.send(
    new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: `Mini-Jira Daily Digest — ${today}`,
      Message: lines.join('\n'),
    })
  );

  console.log(`Digest sent: ${tasks.length} tasks, ${byAssignee.size} assignees`);
};
