import { Router, Response } from 'express';
import { TeamModel } from '../models/team';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teams = await TeamModel.getAll();
    res.json(teams);
  })
);

router.get(
  '/:teamId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teamId = req.params.teamId as string;
    const team = await TeamModel.getById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    res.json(team);
  })
);

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can create teams' });
      return;
    }

    const { name } = req.body;
    const team = await TeamModel.create({ name });
    res.status(201).json(team);
  })
);

router.patch(
  '/:teamId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can update teams' });
      return;
    }

    const teamId = req.params.teamId as string;
    const existing = await TeamModel.getById(teamId);
    if (!existing) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const team = await TeamModel.update(teamId, req.body);
    res.json(team);
  })
);

router.delete(
  '/:teamId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can delete teams' });
      return;
    }

    const teamId = req.params.teamId as string;
    await TeamModel.delete(teamId);
    res.status(204).send();
  })
);

export { router as teamRoutes };
