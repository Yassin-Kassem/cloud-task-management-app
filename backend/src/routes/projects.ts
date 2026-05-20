import { Router, Response } from 'express';
import { ProjectModel } from '../models/project';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projects = await ProjectModel.getAll();
    res.json(projects);
  })
);

router.get(
  '/:projectId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const projectId = req.params.projectId as string;
    const project = await ProjectModel.getById(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  })
);

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can create projects' });
      return;
    }

    const { name, description } = req.body;
    const project = await ProjectModel.create({
      name,
      description: description || '',
      createdBy: req.user?.userId || '',
    });

    res.status(201).json(project);
  })
);

router.patch(
  '/:projectId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can update projects' });
      return;
    }

    const projectId = req.params.projectId as string;
    const existing = await ProjectModel.getById(projectId);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const project = await ProjectModel.update(projectId, req.body);
    res.json(project);
  })
);

router.delete(
  '/:projectId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can delete projects' });
      return;
    }

    const projectId = req.params.projectId as string;
    await ProjectModel.delete(projectId);
    res.status(204).send();
  })
);

export { router as projectRoutes };
