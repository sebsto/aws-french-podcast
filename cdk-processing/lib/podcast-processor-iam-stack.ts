import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export class PodcastProcessorIamStack extends cdk.Stack {
  public readonly stepFunctionsRole: iam.Role;
  public readonly transcribeRole: iam.Role;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step Functions execution role with least privilege
    this.stepFunctionsRole = new iam.Role(this, 'StepFunctionsExecutionRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
      description: 'Execution role for podcast processor Step Functions state machine',
      inlinePolicies: {
        PodcastProcessorPolicy: new iam.PolicyDocument({
          statements: [
            // Transcribe permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'transcribe:StartTranscriptionJob',
                'transcribe:GetTranscriptionJob'
              ],
              resources: ['*']
            }),

            // IAM PassRole permission for Transcribe service role
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'iam:PassRole'
              ],
              resources: [
                `arn:aws:iam::${this.account}:role/PodcastProcessorIamStack-TranscribeServiceRole*`
              ]
            }),
            // SNS permissions for podcast notification and alert topics
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish'
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:*`
              ]
            }),
            // Lambda permissions for content generation
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'lambda:InvokeFunction'
              ],
              resources: [
                `arn:aws:lambda:${this.region}:${this.account}:function:podcast-content-generator`
              ]
            }),
            // S3 permissions for reading transcription results and writing output files
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:GetObjectUrl'
              ],
              resources: [
                'arn:aws:s3:::aws-french-podcast-media/text/*'
              ]
            }),
            // Enhanced CloudWatch Logs permissions for comprehensive logging
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogGroups',
                'logs:DescribeLogStreams'
              ],
              resources: [
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/stepfunctions/podcast-transcription*`,
                `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/stepfunctions/podcast-content-generation*`
              ]
            }),
            // CloudWatch Logs delivery permissions (previously from AWSStepFunctionsServiceRole)
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogDelivery',
                'logs:GetLogDelivery',
                'logs:UpdateLogDelivery',
                'logs:DeleteLogDelivery',
                'logs:ListLogDeliveries',
                'logs:PutResourcePolicy',
                'logs:DescribeResourcePolicies',
                'logs:DescribeLogGroups'
              ],
              resources: ['*']
            }),
            // X-Ray tracing permissions for performance monitoring
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'xray:PutTraceSegments',
                'xray:PutTelemetryRecords',
                'xray:GetSamplingRules',
                'xray:GetSamplingTargets'
              ],
              resources: ['*']
            })
          ]
        })
      }
    });

    // Transcribe service role with least privilege
    this.transcribeRole = new iam.Role(this, 'TranscribeServiceRole', {
      assumedBy: new iam.ServicePrincipal('transcribe.amazonaws.com'),
      description: 'Service role for Amazon Transcribe to access S3 bucket',
      inlinePolicies: {
        TranscribeS3Policy: new iam.PolicyDocument({
          statements: [
            // Read access to media files
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject'
              ],
              resources: [
                'arn:aws:s3:::aws-french-podcast-media/media/*'
              ]
            }),
            // Write access to text output
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject'
              ],
              resources: [
                'arn:aws:s3:::aws-french-podcast-media/text/*'
              ]
            })
          ]
        })
      }
    });

    // Output the role ARNs for reference
    new cdk.CfnOutput(this, 'StepFunctionsRoleArn', {
      value: this.stepFunctionsRole.roleArn,
      description: 'ARN of the Step Functions execution role'
    });

    new cdk.CfnOutput(this, 'TranscribeRoleArn', {
      value: this.transcribeRole.roleArn,
      description: 'ARN of the Transcribe service role'
    });
  }


}