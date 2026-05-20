import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { taskApi, teamApi } from '@/lib/api';
import type { Task, Team } from '@/types';
import AppLayout from '@/components/layout/AppLayout';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import TaskModal from '@/components/tasks/TaskModal';
import TaskForm from '@/components/tasks/TaskForm';
import { Plus, Filter } from 'lucide-react';

export default function KanbanPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('');

  const isManager = user?.role === 'MANAGER';

  useEffect(() => {
    const params = teamFilter ? { teamId: teamFilter } : undefined;
    taskApi.getAll(params).then(setTasks).finally(() => setLoading(false));
  }, [teamFilter]);

  useEffect(() => {
    if (isManager) {
      teamApi.getAll().then(setTeams).catch(() => {});
    }
  }, [isManager]);

  return (
    <AppLayout>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b bg-card px-8 py-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Kanban Board</h1>
            <p className="text-xs text-muted-foreground">
              Drag tasks between columns to update their status
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isManager && teams.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <select
                  value={teamFilter}
                  onChange={(e) => { setTeamFilter(e.target.value); setLoading(true); }}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">All Teams</option>
                  {teams.map((t) => (
                    <option key={t.teamId} value={t.teamId}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            {isManager && (
              <button
                onClick={() => setShowCreateForm(true)}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                New Task
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <KanbanBoard
              tasks={tasks}
              onTasksChange={setTasks}
              onTaskClick={setSelectedTask}
            />
          )}
        </div>
      </div>

      <TaskModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      <TaskForm
        open={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onCreated={(task) => setTasks((prev) => [...prev, task])}
      />
    </AppLayout>
  );
}
