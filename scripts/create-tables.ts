import { config } from 'dotenv';
config();

import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

const tables: CreateTableCommandInput[] = [
  {
    TableName: 'Users',
    KeySchema: [{ AttributeName: 'userId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'userId', AttributeType: 'S' },
      { AttributeName: 'teamId', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'teamId-index',
        KeySchema: [
          { AttributeName: 'teamId', KeyType: 'HASH' },
          { AttributeName: 'userId', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Teams',
    KeySchema: [{ AttributeName: 'teamId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'teamId', AttributeType: 'S' }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Projects',
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Tasks',
    KeySchema: [{ AttributeName: 'taskId', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'teamId', AttributeType: 'S' },
      { AttributeName: 'assigneeId', AttributeType: 'S' },
      { AttributeName: 'projectId', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'teamId-index',
        KeySchema: [
          { AttributeName: 'teamId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: 'assigneeId-index',
        KeySchema: [
          { AttributeName: 'assigneeId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: 'projectId-index',
        KeySchema: [
          { AttributeName: 'projectId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'Comments',
    KeySchema: [
      { AttributeName: 'taskId', KeyType: 'HASH' },
      { AttributeName: 'commentId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'commentId', AttributeType: 'S' },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
  {
    TableName: 'ActivityLog',
    KeySchema: [
      { AttributeName: 'taskId', KeyType: 'HASH' },
      { AttributeName: 'timestamp', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  },
];

async function createTables() {
  const existing = await client.send(new ListTablesCommand({}));
  const existingNames = existing.TableNames || [];

  for (const table of tables) {
    if (existingNames.includes(table.TableName!)) {
      console.log(`  Table "${table.TableName}" already exists, skipping.`);
      continue;
    }

    await client.send(new CreateTableCommand(table));
    console.log(`  Created table: ${table.TableName}`);
  }

  console.log('\nAll tables ready.');
}

createTables().catch((err) => {
  console.error('Failed to create tables:', err.message);
  process.exit(1);
});
