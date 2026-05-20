import axios from 'axios';
import type { Task, Project, Team, Comment } from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('idToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const taskApi = {
  getAll: (params?: { teamId?: string; projectId?: string }) =>
    api.get<Task[]>('/tasks', { params }).then((r) => r.data),
  getById: (taskId: string) =>
    api.get<Task>(`/tasks/${taskId}`).then((r) => r.data),
  create: (data: Partial<Task>) =>
    api.post<Task>('/tasks', data).then((r) => r.data),
  update: (taskId: string, data: Partial<Task>) =>
    api.patch<Task>(`/tasks/${taskId}`, data).then((r) => r.data),
  delete: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),
};

export const projectApi = {
  getAll: () => api.get<Project[]>('/projects').then((r) => r.data),
  getById: (id: string) => api.get<Project>(`/projects/${id}`).then((r) => r.data),
  create: (data: Partial<Project>) => api.post<Project>('/projects', data).then((r) => r.data),
  update: (id: string, data: Partial<Project>) => api.patch<Project>(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`),
};

export const teamApi = {
  getAll: () => api.get<Team[]>('/teams').then((r) => r.data),
  getById: (id: string) => api.get<Team>(`/teams/${id}`).then((r) => r.data),
  create: (data: Partial<Team>) => api.post<Team>('/teams', data).then((r) => r.data),
  delete: (id: string) => api.delete(`/teams/${id}`),
};

export const commentApi = {
  getByTask: (taskId: string) =>
    api.get<Comment[]>(`/tasks/${taskId}/comments`).then((r) => r.data),
  create: (taskId: string, data: { content: string }) =>
    api.post<Comment>(`/tasks/${taskId}/comments`, data).then((r) => r.data),
};

export const UserModel = {
  getAll: () =>
    api.get<{ userId: string; displayName: string; teamId: string; role: string }[]>('/users').then((r) => r.data),
};

export default api;
