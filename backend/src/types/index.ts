import { Request } from 'express';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type UserRole = 'MANAGER' | 'EMPLOYEE';
export type ActivityAction = 'CREATED' | 'STATUS_CHANGE' | 'ASSIGNED' | 'COMMENTED' | 'IMAGE_UPLOADED';

export interface User {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  teamId: string;
  teamName: string;
  createdAt: string;
}

export interface Team {
  teamId: string;
  name: string;
  createdAt: string;
}

export interface Project {
  projectId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageVersion {
  versionId: string;
  key: string;
  uploadedAt: string;
}

export interface Task {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  assigneeId: string;
  assigneeName: string;
  teamId: string;
  teamName: string;
  createdBy: string;
  imageKey?: string;
  imageVersions?: ImageVersion[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface Comment {
  taskId: string;
  commentId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

export interface ActivityLogEntry {
  taskId: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: ActivityAction;
  details: Record<string, string>;
}

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string;
  role: UserRole;
  teamId: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  teamFilter?: string | null;
}
