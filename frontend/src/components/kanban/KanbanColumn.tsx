import { Droppable } from '@hello-pangea/dnd';
import type { Task } from '@/types';
import { TASK_STATUS_LABELS } from '@/lib/constants';
import TaskCard from './TaskCard';

const STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  IN_REVIEW: 'bg-amber-50 text-amber-700',
  DONE: 'bg-emerald-50 text-emerald-700',
};

const DOT_COLORS: Record<string, string> = {
  TODO: 'bg-slate-400',
  IN_PROGRESS: 'bg-blue-500',
  IN_REVIEW: 'bg-amber-500',
  DONE: 'bg-emerald-500',
};

interface Props {
  status: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export default function KanbanColumn({ status, tasks, onTaskClick }: Props) {
  return (
    <div className="flex flex-col rounded-xl bg-muted/40 p-3">
      <div className="mb-3 flex items-center gap-2 px-1">
        <div className={`h-2 w-2 rounded-full ${DOT_COLORS[status]}`} />
        <h3 className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[status]}`}>
          {TASK_STATUS_LABELS[status]}
        </h3>
        <span className="ml-auto text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 space-y-2.5 overflow-y-auto rounded-lg p-1 transition-colors duration-200 scrollbar-thin ${
              snapshot.isDraggingOver ? 'bg-primary/5' : ''
            }`}
            style={{ minHeight: '120px' }}
          >
            {tasks.map((task, index) => (
              <TaskCard key={task.taskId} task={task} index={index} onClick={() => onTaskClick(task)} />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <p className="py-8 text-center text-xs text-muted-foreground/60">
                Drop tasks here
              </p>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
