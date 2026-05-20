import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'eu-central-1',
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;

export async function updateUserTeamInCognito(email: string, teamId: string): Promise<void> {
  const usersResult = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  );

  const cognitoUser = usersResult.Users?.[0];
  if (!cognitoUser?.Username) {
    console.warn(`Cognito user not found for email: ${email}`);
    return;
  }

  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: cognitoUser.Username,
      UserAttributes: [
        { Name: 'custom:teamId', Value: teamId },
      ],
    })
  );
}

export async function updateUserRoleInCognito(email: string, role: string): Promise<void> {
  const usersResult = await client.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    })
  );

  const cognitoUser = usersResult.Users?.[0];
  if (!cognitoUser?.Username) return;

  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: cognitoUser.Username,
      UserAttributes: [
        { Name: 'custom:role', Value: role },
      ],
    })
  );
}
