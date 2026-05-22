import { Router, Response } from 'express';
import multer from 'multer';
import { TaskModel } from '../models/task';
import { ActivityLogModel } from '../models/activityLog';
import { S3Service } from '../services/s3';
import { SnsService } from '../services/sns';
import { CloudWatchService } from '../services/cloudwatch';
import { asyncHandler } from '../middleware/errorHandler';
import { AuthRequest } from '../types';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const teamIdQuery = req.query.teamId as string | undefined;
    const assigneeId = req.query.assigneeId as string | undefined;
    const projectId = req.query.projectId as string | undefined;

    let tasks;
    if (req.teamFilter) {
      tasks = await TaskModel.getByTeam(req.teamFilter);
    } else if (teamIdQuery) {
      tasks = await TaskModel.getByTeam(teamIdQuery);
    } else if (assigneeId) {
      tasks = await TaskModel.getByAssignee(assigneeId);
    } else if (projectId) {
      tasks = await TaskModel.getByProject(projectId);
    } else {
      tasks = await TaskModel.getAll();
    }

    if (!req.teamFilter) {
      const now = new Date().toISOString();
      const overdueCount = tasks.filter(
        (t: any) => t.deadline && t.deadline < now && t.status !== 'DONE'
      ).length;
      CloudWatchService.publishMetric('OverdueTaskCount', overdueCount, 'Count')
        .catch((err) => console.error('CloudWatch OverdueTaskCount failed:', err));
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

    CloudWatchService.taskCreated(task.teamId)
      .catch((err) => console.error('CloudWatch taskCreated failed:', err));

    if (task.assigneeId) {
      SnsService.publishTaskAssignment({
        taskId: task.taskId,
        title: task.title,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        teamId: task.teamId,
        teamName: task.teamName,
        assignedBy: req.user?.userId || '',
        assignedByName: req.user?.displayName || '',
        priority: task.priority,
        deadline: task.deadline || '',
      }).catch((err) => console.error('SNS publish failed:', err));
    }

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
    const oldAssigneeId = existing.assigneeId;
    const task = await TaskModel.update(taskId, req.body);
    if (!task) {
      res.status(500).json({ error: 'Update failed' });
      return;
    }

    if (req.body.status && req.body.status !== oldStatus) {
      await ActivityLogModel.log({
        taskId,
        userId: req.user?.userId || '',
        userName: req.user?.displayName || '',
        action: 'STATUS_CHANGE',
        details: { oldStatus, newStatus: req.body.status },
      });

      if (req.body.status === 'DONE') {
        const timeToCloseMs = Date.now() - Date.parse(existing.createdAt);
        CloudWatchService.taskClosed(existing.teamId, timeToCloseMs)
          .catch((err) => console.error('CloudWatch taskClosed failed:', err));
      }
    }

    if (req.body.assigneeId && req.body.assigneeId !== oldAssigneeId) {
      SnsService.publishTaskAssignment({
        taskId,
        title: task.title,
        assigneeId: task.assigneeId,
        assigneeName: task.assigneeName,
        teamId: task.teamId,
        teamName: task.teamName,
        assignedBy: req.user?.userId || '',
        assignedByName: req.user?.displayName || '',
        priority: task.priority,
        deadline: task.deadline || '',
      }).catch((err) => console.error('SNS publish failed:', err));
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
    const task = await TaskModel.getById(taskId);

    // Clean up S3 image if the task has one
    if (task?.imageKey) {
      await S3Service.delete(task.imageKey);
    }

    await TaskModel.delete(taskId);
    res.status(204).send();
  })
);

// --- Image endpoints ---

router.post(
  '/:taskId/image',
  upload.single('image'),
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

    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const { key, versionId } = await S3Service.upload(
      taskId,
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const imageVersion = {
      versionId: versionId || new Date().toISOString(),
      key,
      uploadedAt: new Date().toISOString(),
    };

    const existingVersions = task.imageVersions || [];
    const updatedTask = await TaskModel.update(taskId, {
      imageKey: key,
      imageVersions: [...existingVersions, imageVersion],
    } as any);

    await ActivityLogModel.log({
      taskId,
      userId: req.user?.userId || '',
      userName: req.user?.displayName || '',
      action: 'IMAGE_UPLOADED',
      details: { key, filename: req.file.originalname },
    });

    res.json(updatedTask);
  })
);

router.delete(
  '/:taskId/image',
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

    if (!task.imageKey) {
      res.status(404).json({ error: 'Task has no image' });
      return;
    }

    await S3Service.delete(task.imageKey);
    await TaskModel.update(taskId, {
      imageKey: '',
      imageVersions: [],
    } as any);

    res.status(204).send();
  })
);

router.get(
  '/:taskId/image-url',
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

    if (!task.imageKey) {
      res.status(404).json({ error: 'Task has no image' });
      return;
    }

    const [originalUrl, thumbnailUrl] = await Promise.all([
      S3Service.getPresignedUrl(task.imageKey),
      S3Service.getThumbnailUrl(task.imageKey),
    ]);

    res.json({ originalUrl, thumbnailUrl });
  })
);

export { router as taskRoutes };
