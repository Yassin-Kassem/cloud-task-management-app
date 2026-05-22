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

/**
 * Builds a clean, human-readable plain-text email body for the assignee.
 * SNS email subscriptions deliver plain text only — HTML styling would
 * require switching to SES, so we format the text nicely instead.
 */
function buildEmailBody(event: TaskAssignmentEvent): string {
  const deadline = event.deadline
    ? new Date(event.deadline).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'No deadline set';

  return [
    `Hi ${event.assigneeName},`,
    ``,
    `You have been assigned a new task on Mini-Jira.`,
    ``,
    `  ------------------------------------------------`,
    `   Task          ${event.title}`,
    `   Priority      ${event.priority}`,
    `   Deadline      ${deadline}`,
    `   Team          ${event.teamName}`,
    `   Assigned by   ${event.assignedByName}`,
    `  ------------------------------------------------`,
    ``,
    `Log in to Mini-Jira to view the details and move it across the board.`,
    ``,
    `— The Mini-Jira team`,
  ].join('\n');
}

/** SNS subjects must be ASCII, single-line, and under 100 characters. */
function buildSubject(title: string): string {
  return `New task assigned: ${title}`
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, 99);
}

export class SnsService {
  static async publishTaskAssignment(event: TaskAssignmentEvent): Promise<void> {
    const topicArn = SNS_TOPICS.TASK_ASSIGNED;
    if (!topicArn) return;

    const emailBody = buildEmailBody(event);

    // MessageStructure 'json' lets a single publish serve both subscribers:
    //   - the email subscription receives the readable `email` text
    //   - the SQS queue (assignment-worker Lambda) receives the `sqs` JSON
    // The Lambda still does JSON.parse(body.Message), so it is unaffected.
    await snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: buildSubject(event.title),
        MessageStructure: 'json',
        Message: JSON.stringify({
          default: emailBody,
          email: emailBody,
          sqs: JSON.stringify(event),
        }),
        MessageAttributes: {
          teamId: { DataType: 'String', StringValue: event.teamId },
        },
      })
    );
  }
}
