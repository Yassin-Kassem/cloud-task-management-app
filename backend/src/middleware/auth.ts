import { Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { AuthRequest } from '../types';
import { UserModel } from '../models/user';

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error('COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID must be set');
    }

    verifier = CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId,
    });
  }
  return verifier;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = await getVerifier().verify(token);

    const userId = payload.sub;
    const email = (payload.email as string) || '';
    const role = (payload['custom:role'] as string) || 'EMPLOYEE';
    const tokenTeamId = (payload['custom:teamId'] as string) || '';
    const displayName = (payload.name as string) || (payload.email as string) || '';

    await UserModel.syncFromToken({ userId, email, displayName, role: role as 'MANAGER' | 'EMPLOYEE', teamId: tokenTeamId });

    const dbUser = await UserModel.getById(userId);
    const teamId = dbUser?.teamId || tokenTeamId;

    req.user = { userId, email, displayName, role: role as 'MANAGER' | 'EMPLOYEE', teamId };

    next();
  } catch (err) {
    console.error('Token verification failed:', err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
