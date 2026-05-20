import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export function teamGuard(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (req.user.role === 'MANAGER') {
    req.teamFilter = null;
    return next();
  }

  if (!req.user.teamId) {
    res.status(403).json({ error: 'No team assigned' });
    return;
  }

  req.teamFilter = req.user.teamId;
  next();
}
