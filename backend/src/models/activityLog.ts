import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { ActivityLogEntry, ActivityAction } from '../types';

export class ActivityLogModel {
  static async log(entry: {
    taskId: string;
    userId: string;
    userName: string;
    action: ActivityAction;
    details: Record<string, string>;
  }): Promise<ActivityLogEntry> {
    const logEntry: ActivityLogEntry = {
      taskId: entry.taskId,
      timestamp: `${new Date().toISOString()}#${uuid()}`,
      userId: entry.userId,
      userName: entry.userName,
      action: entry.action,
      details: entry.details,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.ACTIVITY_LOG,
        Item: logEntry,
      })
    );

    return logEntry;
  }

  static async getByTask(taskId: string): Promise<ActivityLogEntry[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.ACTIVITY_LOG,
        KeyConditionExpression: 'taskId = :taskId',
        ExpressionAttributeValues: { ':taskId': taskId },
        ScanIndexForward: false,
      })
    );
    return (result.Items as ActivityLogEntry[]) || [];
  }
}
