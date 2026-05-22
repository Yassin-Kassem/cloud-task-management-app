import { SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { randomUUID } from 'crypto';

const region = process.env.AWS_REGION || 'eu-central-1';
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));
const cw = new CloudWatchClient({ region });
const TABLE = process.env.ACTIVITY_LOG_TABLE || 'ActivityLog';

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message);

    console.log(`Processing assignment: task=${message.taskId}, assignee=${message.assigneeName}`);

    await dynamo.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          taskId: message.taskId,
          timestamp: `${new Date().toISOString()}#${randomUUID()}`,
          userId: message.assignedBy,
          userName: message.assignedByName,
          action: 'ASSIGNED',
          details: {
            assigneeId: message.assigneeId,
            assigneeName: message.assigneeName,
            teamId: message.teamId,
            title: message.title,
          },
        },
      })
    );

    await cw.send(
      new PutMetricDataCommand({
        Namespace: 'MiniJira',
        MetricData: [
          {
            MetricName: 'TasksAssignedPerTeam',
            Dimensions: [{ Name: 'TeamId', Value: message.teamId }],
            Value: 1,
            Unit: 'Count',
            Timestamp: new Date(),
          },
        ],
      })
    );

    console.log(`Assignment processed for task ${message.taskId}`);
  }
};
