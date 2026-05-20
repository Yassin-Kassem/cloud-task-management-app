import { Router, Response } from 'express';
import { TaskModel } from '../models/task';
import { ActivityLogModel } from '../models/activityLog';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teamIdQuery = req.query.teamId as string | undefined;
    const assigneeId = req.query.assigneeId as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    if (req.teamFilter) {
      const tasks = await TaskModel.getByTeam(req.teamFilter);
      res.json(tasks);
      return;
    }

    let tasks;
    if (teamIdQuery) {
      tasks = await TaskModel.getByTeam(teamIdQuery);
    } else if (assigneeId) {
      tasks = await TaskModel.getByAssignee(assigneeId);
    } else if (projectId) {
      tasks = await TaskModel.getByProject(projectId);
    } else {
      tasks = await TaskModel.getAll();
    }

    res.json(tasks);
  })
);

router.get(
  '/:taskId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const taskId = req.params.taskId as string;
    const task = await TaskModel.getById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (req.teamFilter && task.teamId !== req.teamFilter) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(task);
  })
);

router.post(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { title, description, status, priority, deadline, assigneeId, assigneeName, teamId, teamName, projectId } = req.body;

    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can create tasks' });
      return;
    }

    const task = await TaskModel.create({
      title,
      description: description || '',
      status: status || 'TODO',
      priority: priority || 'MEDIUM',
      deadline,
      assigneeId,
      assigneeName: assigneeName || '',
      teamId,
      teamName: teamName || '',
      projectId: projectId || '',
      createdBy: req.user?.userId || '',
    });

    await ActivityLogModel.log({
      taskId: task.taskId,
      userId: req.user?.userId || '',
      userName: req.user?.displayName || '',
      action: 'CREATED',
      details: { title: task.title },
    });

    res.status(201).json(task);
  })
);

router.patch(
  '/:taskId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const taskId = req.params.taskId as string;
    const existing = await TaskModel.getById(taskId);
    if (!existing) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (req.teamFilter && existing.teamId !== req.teamFilter) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const oldStatus = existing.status;
    const task = await TaskModel.update(taskId, req.body);

    if (req.body.status && req.body.status !== oldStatus) {
      await ActivityLogModel.log({
        taskId,
        userId: req.user?.userId || '',
        userName: req.user?.displayName || '',
        action: 'STATUS_CHANGE',
        details: { oldStatus, newStatus: req.body.status },
      });
    }

    res.json(task);
  })
);

router.get(
  '/:taskId/activity',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const taskId = req.params.taskId as string;
    const task = await TaskModel.getById(taskId);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    if (req.teamFilter && task.teamId !== req.teamFilter) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const activity = await ActivityLogModel.getByTask(taskId);
    res.json(activity);
  })
);

router.delete(
  '/:taskId',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.teamFilter) {
      res.status(403).json({ error: 'Only managers can delete tasks' });
      return;
    }

    const taskId = req.params.taskId as string;
    await TaskModel.delete(taskId);
    res.status(204).send();
  })
);

export { router as taskRoutes };
