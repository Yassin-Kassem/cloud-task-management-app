import { PutCommand, GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { User, AuthUser } from '../types';

export class UserModel {
  static async syncFromToken(authUser: AuthUser): Promise<void> {
    const existing = await UserModel.getById(authUser.userId);
    if (existing) return;

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.USERS,
        Item: {
          userId: authUser.userId,
          email: authUser.email,
          displayName: authUser.displayName,
          role: authUser.role,
          teamId: authUser.teamId,
          teamName: '',
          createdAt: new Date().toISOString(),
        },
      })
    );
  }

  static async getById(userId: string): Promise<User | null> {
    const result = await dynamoDb.send(
      new GetCommand({ TableName: TABLE_NAMES.USERS, Key: { userId } })
    );
    return (result.Item as User) || null;
  }

  static async getByTeam(teamId: string): Promise<User[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.USERS,
        IndexName: 'teamId-index',
        KeyConditionExpression: 'teamId = :teamId',
        ExpressionAttributeValues: { ':teamId': teamId },
      })
    );
    return (result.Items as User[]) || [];
  }

  static async getAll(): Promise<User[]> {
    const result = await dynamoDb.send(
      new ScanCommand({ TableName: TABLE_NAMES.USERS })
    );
    return (result.Items as User[]) || [];
  }

  static async update(userId: string, updates: Partial<User>): Promise<void> {
    const existing = await UserModel.getById(userId);
    if (!existing) return;

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.USERS,
        Item: { ...existing, ...updates },
      })
    );
  }
}
