import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { teamApi, UserModel } from '@/lib/api';
import type { Team } from '@/types';
import AppLayout from '@/components/layout/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

export default function TeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<{ userId: string; displayName: string; teamId: string; role: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showAddMember, setShowAddMember] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const isManager = user?.role === 'MANAGER';

  const reload = () => {
    Promise.all([teamApi.getAll(), UserModel.getAll()])
      .then(([t, u]) => { setTeams(t); setUsers(u); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const team = await teamApi.create({ name: name.trim() });
      setTeams((prev) => [...prev, team]);
      setName('');
      setShowForm(false);
      toast.success('Team created');
    } catch {
      toast.error('Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, teamName: string) => {
    if (!window.confirm(`Delete team "${teamName}"? Members will be unassigned.`)) return;
    try {
      await teamApi.delete(id);
      setTeams((prev) => prev.filter((t) => t.teamId !== id));
      toast.success('Team deleted');
    } catch {
      toast.error('Failed to delete team');
    }
  };

  const handleAssignUser = async (userId: string, teamId: string, teamName: string) => {
    try {
      await api.patch(`/users/${userId}`, { teamId, teamName });
      setUsers((prev) =>
        prev.map((u) => u.userId === userId ? { ...u, teamId, teamName } : u)
      );
      toast.success('Member added to team');
    } catch {
      toast.error('Failed to assign user');
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await api.patch(`/users/${userId}`, { teamId: '', teamName: '' });
      setUsers((prev) =>
        prev.map((u) => u.userId === userId ? { ...u, teamId: '', teamName: '' } : u)
      );
      toast.success('Member removed from team');
    } catch {
      toast.error('Failed to remove user');
    }
  };

  const getUsersByTeam = (teamId: string) => users.filter((u) => u.teamId === teamId);
  const availableUsersForTeam = (teamId: string) =>
    users.filter((u) => u.teamId !== teamId && u.role !== 'MANAGER');
  const addMemberTeam = teams.find((t) => t.teamId === showAddMember);

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage teams and assign members</p>
          </div>
          {isManager && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Team
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-xl border border-dashed p-16 text-center">
            <Users className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-4 text-sm text-muted-foreground">No teams yet</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => {
              const members = getUsersByTeam(t.teamId);
              return (
                <div key={t.teamId} className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="flex gap-1">
                      {isManager && (
                        <button
                          onClick={() => setShowAddMember(t.teamId)}
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary"
                          title="Add member"
                        >
                          <UserPlus className="h-4 w-4" />
                        </button>
                      )}
                      {isManager && (
                        <button
                          onClick={() => handleDelete(t.teamId, t.name)}
                          title="Delete team"
                          className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-all hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="mt-3 font-semibold">{t.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {members.length} member{members.length !== 1 ? 's' : ''}
                  </p>
                  {members.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {members.map((m) => (
                        <div key={m.userId} className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                              {m.displayName.charAt(0)}
                            </div>
                            <span className="text-sm">{m.displayName}</span>
                          </div>
                          {isManager && (
                            <button
                              onClick={() => handleRemoveUser(m.userId)}
                              className="cursor-pointer rounded p-0.5 text-muted-foreground/40 hover:text-red-500"
                              title="Remove from team"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Team Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Team Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Frontend, Backend, QA"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium hover:bg-muted">Cancel</button>
              <button type="submit" disabled={creating} className="inline-flex h-10 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!showAddMember} onOpenChange={() => setShowAddMember(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Member to {addMemberTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {showAddMember && availableUsersForTeam(showAddMember).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No available users to add
              </p>
            ) : (
              showAddMember && availableUsersForTeam(showAddMember).map((u) => (
                <button
                  key={u.userId}
                  onClick={() => {
                    if (showAddMember && addMemberTeam) {
                      handleAssignUser(u.userId, showAddMember, addMemberTeam.name);
                    }
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {u.displayName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.displayName}</p>
                    <p className="text-xs text-muted-foreground">{u.role}</p>
                  </div>
                  <UserPlus className="ml-auto h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
