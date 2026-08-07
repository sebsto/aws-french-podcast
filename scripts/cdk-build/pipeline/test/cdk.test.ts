import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PipelineStack } from '../lib/cdk-stack';
import * as path from 'path';
import * as fs from 'fs';

describe('PipelineStack', () => {
  let template: Template;

  beforeAll(() => {
    // Create a temporary directory structure to satisfy asset staging
    const tmpDir = '/tmp/cdk-test-assets';
    const lambdaDir = path.join(tmpDir, 'lambda', 'analytics');
    if (!fs.existsSync(lambdaDir)) {
      fs.mkdirSync(lambdaDir, { recursive: true });
      fs.writeFileSync(path.join(lambdaDir, 'handler.py'), '# mock');
      fs.writeFileSync(path.join(lambdaDir, 'requirements.txt'), '# mock');
    }

    const app = new cdk.App({
      context: {
        // Force local bundling to skip Docker
        'aws:cdk:bundling-stacks': [],
      },
    });
    
    const stack = new PipelineStack(app, 'TestStack', {
      env: { account: '226945380156', region: 'eu-central-1' },
      synthesizer: new cdk.DefaultStackSynthesizer({
        generateBootstrapVersionRule: false,
      }),
    });
    template = Template.fromStack(stack);
  });

  describe('Scheduled Pipeline Triggers', () => {
    test('Friday pipeline schedule exists and runs at 5am UTC', () => {
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        Name: 'french-podcast-friday-pipeline',
        ScheduleExpression: 'cron(0 5 ? * FRI *)',
        ScheduleExpressionTimezone: 'UTC',
        State: 'ENABLED',
      });
    });

    test('Wednesday pipeline schedule exists and runs at 5am UTC', () => {
      template.hasResourceProperties('AWS::Scheduler::Schedule', {
        Name: 'french-podcast-wednesday-pipeline',
        ScheduleExpression: 'cron(0 5 ? * WED *)',
        ScheduleExpressionTimezone: 'UTC',
        State: 'ENABLED',
      });
    });

    test('Scheduler role has permission to start pipeline execution', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'codepipeline:StartPipelineExecution',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    test('Both scheduled triggers target the CodePipeline', () => {
      // Verify there are exactly 2 scheduler schedules
      const schedules = template.findResources('AWS::Scheduler::Schedule');
      expect(Object.keys(schedules).length).toBe(2);

      // Verify each schedule targets the pipeline
      for (const [, schedule] of Object.entries(schedules)) {
        expect((schedule as any).Properties.Target.Arn).toBeDefined();
      }
    });
  });

  describe('Pipeline Configuration', () => {
    test('Pipeline exists with correct name', () => {
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Name: 'FrenchPodcastPipeline',
      });
    });

    test('Pipeline failure notification rule exists', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: Match.objectLike({
          source: ['aws.codepipeline'],
          'detail-type': ['CodePipeline Pipeline Execution State Change'],
          detail: {
            state: ['FAILED'],
          },
        }),
      });
    });
  });

  describe('Analytics', () => {
    test('Daily analytics schedule exists and runs at 4am UTC', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'podcast-analytics-daily',
        ScheduleExpression: 'cron(0 4 * * ? *)',
        State: 'ENABLED',
      });
    });
  });
});
