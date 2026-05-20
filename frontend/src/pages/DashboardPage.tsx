import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { taskApi, projectApi, teamApi } from '@/lib/api';
import type { Task, Project, Team } from '@/types';
import { TASK_STATUS_LABELS } from '@/lib/constants';
import AppLayout from '@/components/layout/AppLayout';
import { BarChart3, FolderKanban, Users, CheckCircle2 } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([taskApi.getAll(), projectApi.getAll(), teamApi.getAll()])
      .then(([t, p, tm]) => { setTasks(t); setProjects(p); setTeams(tm); })
      .finally(() => setLoading(false));
  }, []);

  const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  const overdueTasks = tasks.filter(
    (t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'DONE'
  );

  const STATS = [
    { label: 'Total Tasks', value: tasks.length, icon: BarChart3, color: 'text-primary bg-primary/10' },
    { label: 'Projects', value: projects.length, icon: FolderKanban, color: 'text-violet-600 bg-violet-50' },
    { label: 'Teams', value: teams.length, icon: Users, color: 'text-amber-600 bg-amber-50' },
    { label: 'Completed', value: statusCounts['DONE'] || 0, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
  ];

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.displayName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's happening with your tasks today.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              {STATS.map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">{label}</p>
                      <p className="text-2xl font-bold">{value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">Tasks by Status</h2>
                <div className="space-y-3">
                  {Object.entries(TASK_STATUS_LABELS).map(([status, label]) => {
                    const count = statusCounts[status] || 0;
                    const pct = tasks.length ? (count / tasks.length) * 100 : 0;
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-semibold">{count}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">
                  Overdue Tasks
                  {overdueTasks.length > 0 && (
                    <span className="ml-2 inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      {overdueTasks.length}
                    </span>
                  )}
                </h2>
                {overdueTasks.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No overdue tasks — great work!
                  </p>
                ) : (
                  <div className="space-y-2">
                    {overdueTasks.slice(0, 5).map((t) => (
                      <div key={t.taskId} className="flex items-center justify-between rounded-lg bg-red-50/50 px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.assigneeName}</p>
                        </div>
                        <span className="text-xs font-medium text-red-600">
                          Due {new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
