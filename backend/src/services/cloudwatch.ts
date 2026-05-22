import { PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { cloudWatchClient } from '../config/aws';

const NAMESPACE = 'MiniJira';

export class CloudWatchService {
  static async publishMetric(
    metricName: string,
    value: number,
    unit: 'Count' | 'Milliseconds' | 'None',
    dimensions?: Array<{ Name: string; Value: string }>
  ): Promise<void> {
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Dimensions: dimensions,
            Timestamp: new Date(),
          },
        ],
      })
    );
  }

  static async taskCreated(teamId: string): Promise<void> {
    await this.publishMetric('TasksCreated', 1, 'Count', [
      { Name: 'TeamId', Value: teamId },
    ]);
  }

  static async taskClosed(teamId: string, timeToCloseMs: number): Promise<void> {
    await Promise.all([
      this.publishMetric('TasksClosed', 1, 'Count', [
        { Name: 'TeamId', Value: teamId },
      ]),
      this.publishMetric('TimeToClose', timeToCloseMs, 'Milliseconds', [
        { Name: 'TeamId', Value: teamId },
      ]),
    ]);
  }

  static async tasksAssignedPerTeam(teamId: string): Promise<void> {
    await this.publishMetric('TasksAssignedPerTeam', 1, 'Count', [
      { Name: 'TeamId', Value: teamId },
    ]);
  }
}
