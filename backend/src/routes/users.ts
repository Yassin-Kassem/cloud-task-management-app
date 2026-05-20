import { Router, Response } from 'express';
import { UserModel } from '../models/user';
import { updateUserTeamInCognito } from '../services/cognito';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

router.get(
  '/me',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const user = await UserModel.getById(req.user.userId);
    res.json(user || req.user);
  })
);

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teamId = req.query.teamId as string | undefined;

    if (req.teamFilter) {
      const users = await UserModel.getByTeam(req.teamFilter);
      res.json(users);
      return;
    }

    if (teamId) {
      const users = await UserModel.getByTeam(teamId);
      res.json(users);
      return;
    }

    const users = await UserModel.getAll();
    res.json(users);
  })
);

router.patch(
  '/:userId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can update users' });
      return;
    }

    const userId = req.params.userId as string;
    const { teamId, teamName } = req.body;

    const user = await UserModel.getById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await UserModel.update(userId, { teamId, teamName });

    try {
      await updateUserTeamInCognito(user.email, teamId);
    } catch (err) {
      console.error('Failed to update Cognito (non-blocking):', err);
    }

    const updated = await UserModel.getById(userId);
    res.json(updated);
  })
);

export { router as userRoutes };
