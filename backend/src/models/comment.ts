import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuid } from 'uuid';
import { dynamoDb, TABLE_NAMES } from '../config/aws';
import { Comment } from '../types';

export class CommentModel {
  static async create(
    taskId: string,
    data: { userId: string; userName: string; content: string }
  ): Promise<Comment> {
    const comment: Comment = {
      taskId,
      commentId: uuid(),
      userId: data.userId,
      userName: data.userName,
      content: data.content,
      createdAt: new Date().toISOString(),
    };

    await dynamoDb.send(
      new PutCommand({
        TableName: TABLE_NAMES.COMMENTS,
        Item: comment,
      })
    );

    return comment;
  }

  static async getByTask(taskId: string): Promise<Comment[]> {
    const result = await dynamoDb.send(
      new QueryCommand({
        TableName: TABLE_NAMES.COMMENTS,
        KeyConditionExpression: 'taskId = :taskId',
        ExpressionAttributeValues: { ':taskId': taskId },
        ScanIndexForward: true,
      })
    );
    return (result.Items as Comment[]) || [];
  }
}
