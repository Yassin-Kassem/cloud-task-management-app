import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { Team } from '../types';

export class TeamModel {
  static async create(data: { name: string }): Promise<Team> {
    const team: Team = {
      teamId: data.name.toLowerCase().replace(/\s+/g, '-'),
      name: data.name,
      createdAt: new Date().toISOString(),
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.TEAMS,
        Item: team,
      })
    );

    return team;
  }

  static async getById(teamId: string): Promise<Team | null> {
    const result = await dynamoDb.send(
      new GetCommand({
        TableName: TABLE_NAMES.TEAMS,
        Key: { teamId },
      })
    );
    return (result.Item as Team) || null;
  }

  static async getAll(): Promise<Team[]> {
    const result = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAMES.TEAMS })
    );
    return (result.Items as Team[]) || [];
  }

  static async update(teamId: string, updates: Partial<Team>): Promise<Team | null> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, any> = {};

    Object.entries(updates).forEach(([key, value]) => {
      if (key === 'teamId') return;
      expressions.push(`#${key} = :${key}`);
      names[`#${key}`] = key;
      values[`:${key}`] = value;
    });

    if (expressions.length === 0) return TeamModel.getById(teamId);

    const result = await dynamoDb.send(
      new UpdateCommand({
        TableName: TABLE_NAMES.TEAMS,
        Key: { teamId },
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      })
    );

    return (result.Attributes as Team) || null;
  }

  static async delete(teamId: string): Promise<void> {
    await dynamoDb.send(
      new DeleteCommand({
        TableName: TABLE_NAMES.TEAMS,
        Key: { teamId },
      })
    );
  }
}
