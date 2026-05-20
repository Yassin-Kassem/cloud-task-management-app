import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { taskApi, teamApi } from '@/lib/api';
import type { Task, Team } from '@/types';
import { toast } from 'sonner';
import { UserModel } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  projectId?: string;
}

export default function TaskForm({ open, onClose, onCreated, projectId }: Props) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<{ userId: string; displayName: string; teamId: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');
  const [deadline, setDeadline] = useState('');
  const [teamId, setTeamId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  useEffect(() => {
    if (!open) return;
    teamApi.getAll().then(setTeams).catch(() => {});
    UserModel.getAll().then(setUsers).catch(() => {});
  }, [open]);

  const filteredUsers = teamId ? users.filter((u) => u.teamId === teamId) : users;
  const selectedUser = users.find((u) => u.userId === assigneeId);
  const selectedTeam = teams.find((t) => t.teamId === teamId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !teamId || !assigneeId) {
      toast.error('Fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      const task = await taskApi.create({
        title: title.trim(),
        description: description.trim(),
        status: 'TODO',
        priority: priority as Task['priority'],
        deadline: deadline || new Date(Date.now() + 7 * 86400000).toISOString(),
        teamId,
        teamName: selectedTeam?.name || teamId,
        assigneeId,
        assigneeName: selectedUser?.displayName || '',
        projectId: projectId || '',
      });
      toast.success('Task created');
      onCreated(task);
      resetForm();
      onClose();
    } catch {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setDeadline('');
    setTeamId('');
    setAssigneeId('');
  };

  const inputClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';
  const labelClass = 'text-sm font-medium';

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Team *</label>
              <select
                value={teamId}
                onChange={(e) => { setTeamId(e.target.value); setAssigneeId(''); }}
                className={inputClass}
                required
              >
                <option value="">Select team...</option>
                {teams.map((t) => (
                  <option key={t.teamId} value={t.teamId}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Assignee *</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputClass} required>
                <option value="">Select assignee...</option>
                {filteredUsers.map((u) => (
                  <option key={u.userId} value={u.userId}>{u.displayName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
