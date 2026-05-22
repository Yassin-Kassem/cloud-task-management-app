import { PublishCommand } from '@aws-sdk/client-sns';
import { snsClient, SNS_TOPICS } from '../config/aws';

interface TaskAssignmentEvent {
  taskId: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  teamId: string;
  teamName: string;
  assignedBy: string;
  assignedByName: string;
  priority: string;
  deadline: string;
}

export class SnsService {
  static async publishTaskAssignment(event: TaskAssignmentEvent): Promise<void> {
    const topicArn = SNS_TOPICS.TASK_ASSIGNED;
    if (!topicArn) return;

    await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: `Task Assigned: ${event.title}`,
        Message: JSON.stringify(event),
        MessageAttributes: {
          teamId: { DataType: 'String', StringValue: event.teamId },
        },
      })
    );
  }
}
