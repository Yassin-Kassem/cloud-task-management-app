import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { Project } from '../types';

export class ProjectModel {
  static stripEmpty(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== '' && value !== undefined && value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  static async create(data: Omit<Project, 'projectId' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      ...data,
      projectId: uuid(),
      createdAt: now,
      updatedAt: now,
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Item: ProjectModel.stripEmpty(project) as Project,
      })
    );

    return project;
  }

  static async getById(projectId: string): Promise<Project | null> {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Key: { projectId },
      })
    );
    return (result.Item as Project) || null;
  }

  static async getAll(): Promise<Project[]> {
    const result = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAMES.PROJECTS })
    );
    return (result.Items as Project[]) || [];
  }

  static async update(projectId: string, updates: Partial<Project>): Promise<Project | null> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'projectId') return;
      expressions.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });

    expressions.push('#updatedAt = :updatedAt');
    names['#updatedAt'] = 'updatedAt';
    values[':updatedAt'] = new Date().toISOString();

    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Key: { projectId },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    return (result.Attributes as Project) || null;
  }

  static async delete(projectId: string): Promise<void> {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.PROJECTS,
        Key: { projectId },
      })
    );
  }
}
