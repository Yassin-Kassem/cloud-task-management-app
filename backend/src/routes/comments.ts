import { Router, Response } from 'express';
import { CommentModel } from '../models/comment';
import { TaskModel } from '../models/task';
import { ActivityLogModel } from '../models/activityLog';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router({ mergeParams: true });

router.get(
  '/',
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

    const comments = await CommentModel.getByTask(taskId);
    res.json(comments);
  })
);

router.post(
  '/',
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

    const { content } = req.body;
    const comment = await CommentModel.create(taskId, {
      userId: req.user?.userId || '',
      userName: req.user?.displayName || '',
      content,
    });

    await ActivityLogModel.log({
      taskId,
      userId: req.user?.userId || '',
      userName: req.user?.displayName || '',
      action: 'COMMENTED',
      details: { commentId: comment.commentId },
    });

    res.status(201).json(comment);
  })
);

export { router as commentRoutes };
