import { config } from 'dotenv';
config();

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'eu-central-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

const DEMO_USERS = [
  {
    email: 'yassinkassem29+ali@gmail.com',
    name: 'Ali',
    password: 'Test1234!',
    role: 'MANAGER',
    teamId: 'all',
  },
  {
    email: 'yassinkassem29+sara@gmail.com',
    name: 'Sara',
    password: 'Test1234!',
    role: 'EMPLOYEE',
    teamId: 'frontend',
  },
  {
    email: 'yassinkassem29+omar@gmail.com',
    name: 'Omar',
    password: 'Test1234!',
    role: 'EMPLOYEE',
    teamId: 'backend',
  },
];

async function createUser(user: (typeof DEMO_USERS)[number]) {
  console.log(`\nCreating user: ${user.name} (${user.email})...`);

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: user.email,
        UserAttributes: [
          { Name: 'email', Value: user.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: user.name },
          { Name: 'custom:role', Value: user.role },
          { Name: 'custom:teamId', Value: user.teamId },
        ],
        MessageAction: 'SUPPRESS',
      })
    );
    console.log(`  Created.`);
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      console.log(`  Already exists, updating attributes...`);
      await client.send(
        new AdminUpdateUserAttributesCommand({
          UserPoolId: USER_POOL_ID,
          Username: user.email,
          UserAttributes: [
            { Name: 'name', Value: user.name },
            { Name: 'custom:role', Value: user.role },
            { Name: 'custom:teamId', Value: user.teamId },
          ],
        })
      );
      console.log(`  Attributes updated.`);
    } else {
      throw err;
    }
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: user.email,
      Password: user.password,
      Permanent: true,
    })
  );
  console.log(`  Password set. Ready to login as ${user.name} (${user.role}, team: ${user.teamId})`);
}

async function main() {
  console.log('Setting up demo users in Cognito...');
  console.log(`User Pool: ${USER_POOL_ID}\n`);

  for (const user of DEMO_USERS) {
    await createUser(user);
  }

  console.log('\n--- Demo credentials ---');
  for (const user of DEMO_USERS) {
    console.log(`${user.name}: ${user.email} / ${user.password} (${user.role}, team: ${user.teamId})`);
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
