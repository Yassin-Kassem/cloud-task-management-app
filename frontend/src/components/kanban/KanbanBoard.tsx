import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { taskApi } from '@/lib/api';
import type { Task, TaskStatus } from '@/types';
import { KANBAN_COLUMNS } from '@/lib/constants';
import KanbanColumn from './KanbanColumn';
import { toast } from 'sonner';

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  onTaskClick: (task: Task) => void;
}

export default function KanbanBoard({ tasks, onTasksChange, onTaskClick }: Props) {
  const tasksByStatus = KANBAN_COLUMNS.reduce<Record<string, Task[]>>((acc, status) => {
    acc[status] = tasks.filter((t) => t.status === status);
    return acc;
  }, {});

  const onDragEnd = async (result: DropResult) => {
    const { draggableId, destination, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const newStatus = destination.droppableId as TaskStatus;

    const updated = tasks.map((t) =>
      t.taskId === draggableId ? { ...t, status: newStatus } : t
    );
    onTasksChange(updated);

    try {
      await taskApi.update(draggableId, { status: newStatus });
    } catch {
      onTasksChange(tasks);
      toast.error('Failed to update task status');
    }
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="grid h-full auto-cols-fr grid-flow-col gap-4">
        {KANBAN_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status] || []}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>
    </DragDropContext>
  );
}
