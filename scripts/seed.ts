import { config } from 'dotenv';
config();

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

const isLocal = process.env.NODE_ENV !== 'production';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  ...(isLocal && {
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  }),
});

const dynamoDb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

async function clearTable(tableName: string, keyNames: string[]) {
  const result = await dynamoDb.send(new ScanCommand({ TableName: tableName }));
  for (const item of result.Items || []) {
    const key: Record<string, any> = {};
    for (const k of keyNames) {
      key[k] = item[k];
    }
    await dynamoDb.send(new DeleteCommand({ TableName: tableName, Key: key }));
  }
  console.log(`  Cleared ${tableName} (${result.Items?.length || 0} items)`);
}

async function put(table: string, item: Record<string, any>) {
  await dynamoDb.send(new PutCommand({ TableName: table, Item: item }));
}

async function seed() {
  console.log('Clearing old data...');
  await clearTable('Teams', ['teamId']);
  await clearTable('Projects', ['projectId']);
  await clearTable('Tasks', ['taskId']);
  await clearTable('Comments', ['taskId', 'commentId']);
  await clearTable('ActivityLog', ['taskId', 'timestamp']);
  await clearTable('Users', ['userId']);

  console.log('\nSeeding fresh data...\n');

  const teams = [
    { teamId: 'frontend', name: 'Frontend', createdAt: new Date().toISOString() },
    { teamId: 'backend', name: 'Backend', createdAt: new Date().toISOString() },
    { teamId: 'qa', name: 'QA', createdAt: new Date().toISOString() },
  ];

  for (const team of teams) {
    await put('Teams', team);
    console.log(`  Team: ${team.name} (${team.teamId})`);
  }

  const project = {
    projectId: 'proj-1',
    name: 'Cloud Task Manager',
    description: 'Mini-Jira application for cloud computing course',
    createdBy: 'manager',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await put('Projects', project);
  console.log(`  Project: ${project.name}`);

  console.log('\nDone! Log in as each user (Ali, Sara, Omar) to create their user records.');
  console.log('Then Ali (manager) can assign Sara/Omar to teams via the Teams page.');
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
