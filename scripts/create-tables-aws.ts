import { config } from 'dotenv';
config();

import {
  DynamoDBClient,
  CreateTableCommand,
  ListTablesCommand,
  CreateTableCommandInput,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';

/**
 * Creates the 6 Mini-Jira tables on REAL AWS DynamoDB (Milestone 7).
 *
 * Schema is identical to the local tables in create-tables.ts — same partition
 * keys, sort keys, and GSIs — so the backend behaves the same against AWS as it
 * does against DynamoDB Local. The only difference: on-demand (PAY_PER_REQUEST)
 * billing instead of provisioned throughput. On-demand stays within the Free
 * Tier for demo-level traffic and removes any capacity tuning.
 *
 * Credentials come from the default AWS chain — the AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY in .env, or whatever `aws configure` set up. There is
 * NO local endpoint here: this always targets real AWS in AWS_REGION.
 *
 * Run from the project root:  npm run create-tables-aws
 */

const region = process.env.AWS_REGION || 'eu-central-1';

if (process.env.DYNAMODB_ENDPOINT && process.env.DYNAMODB_ENDPOINT.includes('localhost')) {
  console.warn(
    'NOTE: DYNAMODB_ENDPOINT is set to a local endpoint in .env — it is IGNORED here.\n' +
      '      This script always targets real AWS DynamoDB in region ' + region + '.\n',
  );
}

const client = new DynamoDBClient({ region });

const tables: CreateTableCommandInput[] = [
  {
    TableName: 'Users',
    BillingMode: 'PAY_PER_REQUEST',
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
      },
    ],
  },
  {
    TableName: 'Teams',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'teamId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'teamId', AttributeType: 'S' }],
  },
  {
    TableName: 'Projects',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'projectId', KeyType: 'HASH' }],
    AttributeDefinitions: [{ AttributeName: 'projectId', AttributeType: 'S' }],
  },
  {
    TableName: 'Tasks',
    BillingMode: 'PAY_PER_REQUEST',
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
      },
      {
        IndexName: 'assigneeId-index',
        KeySchema: [
          { AttributeName: 'assigneeId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'projectId-index',
        KeySchema: [
          { AttributeName: 'projectId', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  },
  {
    TableName: 'Comments',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'taskId', KeyType: 'HASH' },
      { AttributeName: 'commentId', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'commentId', AttributeType: 'S' },
    ],
  },
  {
    TableName: 'ActivityLog',
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'taskId', KeyType: 'HASH' },
      { AttributeName: 'timestamp', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'taskId', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' },
    ],
  },
];

async function createTables() {
  console.log(`Creating Mini-Jira tables on AWS DynamoDB (region: ${region})\n`);

  const existing = await client.send(new ListTablesCommand({}));
  const existingNames = existing.TableNames || [];

  const created: string[] = [];

  for (const table of tables) {
    if (existingNames.includes(table.TableName!)) {
      console.log(`  Table "${table.TableName}" already exists, skipping.`);
      continue;
    }

    await client.send(new CreateTableCommand(table));
    console.log(`  Creating table: ${table.TableName} ...`);
    created.push(table.TableName!);
  }

  // Wait until every newly created table is ACTIVE so a follow-up seed works.
  for (const name of created) {
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: name });
    console.log(`  Table "${name}" is ACTIVE.`);
  }

  console.log('\nAll 6 tables ready on AWS. Next: seed them (see aws-setup-guide-m7.md).');
}

createTables().catch((err) => {
  console.error('\nFailed to create tables:', err.message);
  console.error('Check that AWS credentials are valid and the region is correct.');
  process.exit(1);
});
