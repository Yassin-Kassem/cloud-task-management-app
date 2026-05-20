import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const isLocal = process.env.NODE_ENV !== 'production';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  ...(isLocal && {
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  }),
});

export const dynamoDb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

export const TABLE_NAMES = {
  USERS: process.env.USERS_TABLE || 'Users',
  TEAMS: process.env.TEAMS_TABLE || 'Teams',
  PROJECTS: process.env.PROJECTS_TABLE || 'Projects',
  TASKS: process.env.TASKS_TABLE || 'Tasks',
  COMMENTS: process.env.COMMENTS_TABLE || 'Comments',
  ACTIVITY_LOG: process.env.ACTIVITY_LOG_TABLE || 'ActivityLog',
} as const;
