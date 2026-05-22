import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Calendar, Clock, User, Send, Paperclip } from 'lucide-react';
import { commentApi } from '@/lib/api';
import ImageUpload from '@/components/tasks/ImageUpload';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '@/lib/constants';
import type { Task, Comment, ActivityLogEntry } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import api from '@/lib/api';

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH: 'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

interface Props {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onTaskUpdate?: () => void;
}

export default function TaskModal({ task, open, onClose, onTaskUpdate }: Props) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!task || !open) return;
    commentApi.getByTask(task.taskId).then(setComments).catch(() => {});
    api.get<ActivityLogEntry[]>(`/tasks/${task.taskId}/activity`).then((r) => setActivity(r.data)).catch(() => {});
  }, [task, open]);

  const handleComment = async () => {
    if (!task || !newComment.trim()) return;
    setSending(true);
    try {
      const comment = await commentApi.create(task.taskId, { content: newComment.trim() });
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch {
      toast.error('Failed to post comment');
    } finally {
      setSending(false);
    }
  };

  if (!task) return null;

  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'DONE';

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="space-y-3 px-6 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <DialogTitle className="text-lg font-bold leading-tight">{task.title}</DialogTitle>
              {task.description && (
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{task.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={PRIORITY_BADGE[task.priority]}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </Badge>
            <Badge variant="secondary">{TASK_STATUS_LABELS[task.status]}</Badge>
            {task.teamName && <Badge variant="outline">{task.teamName}</Badge>}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            {task.assigneeName && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" /> {task.assigneeName}
              </span>
            )}
            {task.deadline && (
              <span className={`inline-flex items-center gap-1.5 ${isOverdue ? 'font-semibold text-red-600' : ''}`}>
                <Calendar className="h-3.5 w-3.5" />
                {new Date(task.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {isOverdue && ' (Overdue)'}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Created {new Date(task.createdAt).toLocaleDateString()}
            </span>
          </div>
        </DialogHeader>

        <Separator className="mt-4" />

        <Tabs defaultValue="comments" className="flex flex-col overflow-hidden">
          <TabsList className="mx-6 w-fit">
            <TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger>
            <TabsTrigger value="activity">Activity ({activity.length})</TabsTrigger>
            <TabsTrigger value="attachments">
              <Paperclip className="mr-1 inline h-3.5 w-3.5" />
              Attachments
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comments" className="flex flex-1 flex-col overflow-hidden px-6 pb-6">
            <div className="flex-1 space-y-3 overflow-y-auto py-3 scrollbar-thin" style={{ maxHeight: '240px' }}>
              {comments.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No comments yet</p>
              )}
              {comments.map((c) => (
                <div key={c.commentId} className="rounded-lg bg-muted/50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                      {c.userName.charAt(0)}
                    </div>
                    <span className="text-xs font-semibold">{c.userName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1.5 pl-8 text-sm">{c.content}</p>
                </div>
              ))}
            </div>

            {user && (
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                  placeholder="Write a comment..."
                  className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={handleComment}
                  disabled={sending || !newComment.trim()}
                  className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="px-6 pb-6">
            <div className="max-h-[300px] space-y-2 overflow-y-auto py-3 scrollbar-thin">
              {activity.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No activity yet</p>
              )}
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 py-1.5">
                  <div className="mt-0.5 h-2 w-2 rounded-full bg-primary/40" />
                  <div className="flex-1">
                    <p className="text-sm">
                      <span className="font-semibold">{a.userName}</span>{' '}
                      {a.action === 'CREATED' && 'created this task'}
                      {a.action === 'STATUS_CHANGE' &&
                        `moved to ${TASK_STATUS_LABELS[a.details?.newStatus || ''] || a.details?.newStatus}`}
                      {a.action === 'ASSIGNED' && `assigned to ${a.details?.assigneeName || 'someone'}`}
                      {a.action === 'COMMENTED' && 'added a comment'}
                      {a.action === 'IMAGE_UPLOADED' && 'uploaded an image'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(a.timestamp.split('#')[0]!).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="attachments" className="px-6 pb-6">
            <div className="py-3">
              <ImageUpload
                taskId={task.taskId}
                imageKey={task.imageKey}
                onImageChange={() => onTaskUpdate?.()}
              />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
