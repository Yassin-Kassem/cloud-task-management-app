import { Draggable } from '@hello-pangea/dnd';
import { Calendar, MessageSquare } from 'lucide-react';
import type { Task } from '@/types';

const PRIORITY_STYLES: Record<string, { border: string; badge: string }> = {
  CRITICAL: { border: 'border-l-red-500', badge: 'bg-red-50 text-red-700' },
  HIGH: { border: 'border-l-orange-500', badge: 'bg-orange-50 text-orange-700' },
  MEDIUM: { border: 'border-l-yellow-500', badge: 'bg-yellow-50 text-yellow-700' },
  LOW: { border: 'border-l-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
};

interface Props {
  task: Task;
  index: number;
  onClick: () => void;
}

export default function TaskCard({ task, index, onClick }: Props) {
  const priority = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES['MEDIUM']!;
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'DONE';

  return (
    <Draggable draggableId={task.taskId} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`cursor-pointer rounded-lg border border-l-[3px] bg-card p-3 transition-all duration-150 ${priority.border} ${
            snapshot.isDragging
              ? 'rotate-[2deg] shadow-lg ring-2 ring-primary/20'
              : 'shadow-sm hover:shadow-md'
          }`}
        >
          <p className="text-sm font-semibold leading-snug text-foreground">{task.title}</p>

          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {task.description}
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${priority.badge}`}>
              {task.priority}
            </span>

            {task.deadline && (
              <span className={`inline-flex items-center gap-1 text-[10px] ${isOverdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}>
                <Calendar className="h-3 w-3" />
                {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {task.assigneeName && (
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {task.assigneeName.charAt(0)}
                </div>
                <span className="text-xs text-muted-foreground">{task.assigneeName}</span>
              </div>
              <MessageSquare className="h-3 w-3 text-muted-foreground/40" />
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
}
