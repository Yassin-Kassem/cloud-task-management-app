import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { Task } from '../types';

export class TaskModel {
  static stripEmpty(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== '' && value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  static async create(data: Omit<Task, 'taskId' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      ...data,
      taskId: uuid(),
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.TASKS,
        Item: TaskModel.stripEmpty(task) as Task,
      })
    );

    return task;
  }

  static async getById(taskId: string): Promise<Task | null> {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: TABLE_NAMES.TASKS,
        Key: { taskId },
      })
    );
    return (result.Item as Task) || null;
  }

  static async getByTeam(teamId: string): Promise<Task[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.TASKS,
        IndexName: 'teamId-index',
        KeyConditionExpression: 'teamId = :teamId',
        ExpressionAttributeValues: { ':teamId': teamId },
        ScanIndexForward: false,
      })
    );
    return (result.Items as Task[]) || [];
  }

  static async getByAssignee(assigneeId: string): Promise<Task[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.TASKS,
        IndexName: 'assigneeId-index',
        KeyConditionExpression: 'assigneeId = :assigneeId',
        ExpressionAttributeValues: { ':assigneeId': assigneeId },
        ScanIndexForward: false,
      })
    );
    return (result.Items as Task[]) || [];
  }

  static async getByProject(projectId: string): Promise<Task[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.TASKS,
        IndexName: 'projectId-index',
        KeyConditionExpression: 'projectId = :projectId',
        ExpressionAttributeValues: { ':projectId': projectId },
        ScanIndexForward: false,
      })
    );
    return (result.Items as Task[]) || [];
  }

  static async getAll(): Promise<Task[]> {
    const result = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAMES.TASKS })
    );
    return (result.Items as Task[]) || [];
  }

  static async update(taskId: string, updates: Partial<Task>): Promise<Task | null> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'taskId') return;
      expressions.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });

    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();

    if (updates.status === 'DONE' && !updates.closedAt) {
      expressions.push('#closedAt = :closedAt');
      names['#closedAt'] = 'closedAt';
      values[':closedAt'] = new Date().toISOString();
    }

    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.TASKS,
        Key: { taskId },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    return (result.Attributes as Task) || null;
  }

  static async delete(taskId: string): Promise<void> {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.TASKS,
        Key: { taskId },
      })
    );
  }
}
