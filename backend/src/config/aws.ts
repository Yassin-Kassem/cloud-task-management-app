import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SNSClient } from '@aws-sdk/client-sns';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

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

// S3 client (no local endpoint — S3 always hits real AWS, even in dev)
export const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
});

export const S3_BUCKETS = {
  get ORIGINALS() { return process.env.S3_ORIGINALS_BUCKET || 'mini-jira-originals'; },
  get RESIZED() { return process.env.S3_RESIZED_BUCKET || 'mini-jira-resized'; },
};

export const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'eu-central-1',
});

export const cloudWatchClient = new CloudWatchClient({
  region: process.env.AWS_REGION || 'eu-central-1',
});

export const SNS_TOPICS = {
  get TASK_ASSIGNED() { return process.env.SNS_TASK_ASSIGNED_ARN || ''; },
};
