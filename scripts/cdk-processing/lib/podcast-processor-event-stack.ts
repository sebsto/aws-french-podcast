import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';

export interface PodcastProcessorEventStackProps extends cdk.StackProps {
  transcriptionStateMachine?: stepfunctions.IStateMachine;
  contentGenerationStateMachine?: stepfunctions.IStateMachine;
}

export class PodcastProcessorEventStack extends cdk.Stack {
  public readonly mp3UploadRule: events.Rule;
  public readonly transcriptionCompletionRule: events.Rule;

  constructor(scope: Construct, id: string, props?: PodcastProcessorEventStackProps) {
    super(scope, id, props);

    // Enable EventBridge notifications on the existing S3 bucket
    // This custom resource configures the bucket to send events to EventBridge
    new cr.AwsCustomResource(this, 'EnableS3EventBridge', {
      onCreate: {
        service: 'S3',
        action: 'putBucketNotificationConfiguration',
        parameters: {
          Bucket: 'aws-french-podcast-media',
          NotificationConfiguration: {
            EventBridgeConfiguration: {}
          }
        },
        physicalResourceId: cr.PhysicalResourceId.of('s3-eventbridge-config')
      },
      onUpdate: {
        service: 'S3',
        action: 'putBucketNotificationConfiguration',
        parameters: {
          Bucket: 'aws-french-podcast-media',
          NotificationConfiguration: {
            EventBridgeConfiguration: {}
          }
        },
        physicalResourceId: cr.PhysicalResourceId.of('s3-eventbridge-config')
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            's3:PutBucketNotification',
            's3:GetBucketNotification'
          ],
          resources: [`arn:aws:s3:::aws-french-podcast-media`]
        })
      ])
    });

    // EventBridge rule to capture S3 object creation and update events for MP3 files
    // Note: EventBridge doesn't support combining prefix and suffix in the same pattern
    // We filter for media/ prefix and handle .mp3 suffix validation in the Step Functions workflow
    this.mp3UploadRule = new events.Rule(this, 'PodcastUploadRule', {
      description: 'Triggers podcast transcription workflow when MP3 files are uploaded or updated in media/ folder',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created', 'Object Put'],
        detail: {
          bucket: {
            name: ['aws-french-podcast-media']
          },
          object: {
            key: [{
              prefix: 'media/'
            }]
          }
        }
      }
    });

    // EventBridge rule to capture transcription completion events (JSON files in text/ folder)
    // Filter for files ending with -transcribe.json to avoid triggering on temp/test files
    this.transcriptionCompletionRule = new events.Rule(this, 'TranscriptionCompletionRule', {
      description: 'Triggers content generation workflow when transcription JSON files are created or updated in text/ folder',
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created', 'Object Put'],
        detail: {
          bucket: {
            name: ['aws-french-podcast-media']
          },
          object: {
            key: [{
              suffix: '-transcribe.json'
            }]
          }
        }
      }
    });

    // Create IAM role for EventBridge to invoke Step Functions (only if state machines are provided)
    let eventBridgeStepFunctionsRole: iam.Role | undefined;
    
    const stateMachineArns = [
      ...(props?.transcriptionStateMachine ? [props.transcriptionStateMachine.stateMachineArn] : []),
      ...(props?.contentGenerationStateMachine ? [props.contentGenerationStateMachine.stateMachineArn] : [])
    ];

    if (stateMachineArns.length > 0) {
      eventBridgeStepFunctionsRole = new iam.Role(this, 'EventBridgeStepFunctionsRole', {
        assumedBy: new iam.ServicePrincipal('events.amazonaws.com'),
        inlinePolicies: {
          StepFunctionsExecution: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: ['states:StartExecution'],
                resources: stateMachineArns
              })
            ]
          })
        }
      });
    }

    // Add transcription Step Functions target for MP3 uploads
    if (props?.transcriptionStateMachine && eventBridgeStepFunctionsRole) {
      this.mp3UploadRule.addTarget(new targets.SfnStateMachine(props.transcriptionStateMachine, {
        input: events.RuleTargetInput.fromEventPath('$.detail'),
        role: eventBridgeStepFunctionsRole
      }));
    }

    // Add content generation Step Functions target for transcription completion
    if (props?.contentGenerationStateMachine && eventBridgeStepFunctionsRole) {
      this.transcriptionCompletionRule.addTarget(new targets.SfnStateMachine(props.contentGenerationStateMachine, {
        input: events.RuleTargetInput.fromEventPath('$.detail'),
        role: eventBridgeStepFunctionsRole
      }));
    }

    // Output the rule ARNs for reference
    new cdk.CfnOutput(this, 'Mp3UploadRuleArn', {
      value: this.mp3UploadRule.ruleArn,
      description: 'ARN of the EventBridge rule for MP3 upload processing'
    });

    new cdk.CfnOutput(this, 'Mp3UploadRuleName', {
      value: this.mp3UploadRule.ruleName,
      description: 'Name of the EventBridge rule for MP3 upload processing'
    });

    new cdk.CfnOutput(this, 'TranscriptionCompletionRuleArn', {
      value: this.transcriptionCompletionRule.ruleArn,
      description: 'ARN of the EventBridge rule for transcription completion processing'
    });

    new cdk.CfnOutput(this, 'TranscriptionCompletionRuleName', {
      value: this.transcriptionCompletionRule.ruleName,
      description: 'Name of the EventBridge rule for transcription completion processing'
    });
  }
}