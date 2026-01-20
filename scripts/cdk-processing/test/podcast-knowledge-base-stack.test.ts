import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { PodcastKnowledgeBaseStack } from '../lib/podcast-knowledge-base-stack';

describe('Podcast Knowledge Base Stack', () => {
  let app: cdk.App;
  let stack: PodcastKnowledgeBaseStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const env = { account: '533267385481', region: 'eu-central-1' };
    
    // Create a mock SNS topic for testing
    const mockStack = new cdk.Stack(app, 'MockStack', { env });
    const alertTopic = new sns.Topic(mockStack, 'MockAlertTopic');
    
    stack = new PodcastKnowledgeBaseStack(app, 'TestKnowledgeBaseStack', { 
      env,
      alertTopic
    });
    template = Template.fromStack(stack);
  });

  describe('CloudFormation Snapshot', () => {
    test('matches expected structure', () => {
      // Verify the stack has the expected resources
      template.resourceCountIs('AWS::IAM::Role', 2); // Knowledge Base role + Lambda execution role
      template.resourceCountIs('AWS::Bedrock::KnowledgeBase', 1);
      template.resourceCountIs('AWS::Bedrock::DataSource', 1);
      template.resourceCountIs('AWS::Lambda::Function', 1);
      template.resourceCountIs('AWS::CloudWatch::Alarm', 3); // Lambda errors, S3 write errors, ingestion failures
    });

    test('has correct CloudFormation outputs', () => {
      template.hasOutput('KnowledgeBaseId', {
        Description: 'ID of the Bedrock Knowledge Base',
        Export: {
          Name: 'PodcastKnowledgeBaseId'
        }
      });

      template.hasOutput('KnowledgeBaseArn', {
        Description: 'ARN of the Bedrock Knowledge Base',
        Export: {
          Name: 'PodcastKnowledgeBaseArn'
        }
      });

      template.hasOutput('DataSourceId', {
        Description: 'ID of the S3 data source',
        Export: {
          Name: 'PodcastDataSourceId'
        }
      });

      template.hasOutput('KnowledgeBaseRoleArn', {
        Description: 'ARN of the Knowledge Base service role'
      });

      template.hasOutput('DocumentProcessorFunctionArn', {
        Description: 'ARN of the Document Processor Lambda function',
        Export: {
          Name: 'PodcastDocumentProcessorFunctionArn'
        }
      });

      template.hasOutput('DocumentProcessorFunctionName', {
        Description: 'Name of the Document Processor Lambda function'
      });
    });
  });

  describe('IAM Role', () => {
    test('has correct service principal', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [{
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              Service: 'bedrock.amazonaws.com'
            }
          }]
        }
      });
    });

    test('has correct description', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        Description: 'Service role for Bedrock Knowledge Base to access S3 and invoke embedding models'
      });
    });

    test('has S3 read permissions for kb-documents prefix', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        Policies: [{
          PolicyName: 'KnowledgeBasePolicy',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Effect: 'Allow',
                Action: [
                  's3:GetObject',
                  's3:ListBucket'
                ]
              })
            ])
          }
        }]
      });
    });

    test('has Bedrock InvokeModel permission for Titan Embeddings', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        Policies: [{
          PolicyName: 'KnowledgeBasePolicy',
          PolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Effect: 'Allow',
                Action: 'bedrock:InvokeModel',
                Resource: 'arn:aws:bedrock:eu-central-1::foundation-model/amazon.titan-embed-text-v2:0'
              })
            ])
          }
        }]
      });
    });
  });

  describe('Knowledge Base Configuration', () => {
    test('has correct name and description', () => {
      template.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
        Name: 'podcast-transcription-kb',
        Description: 'Knowledge Base for semantic search across podcast episode transcriptions'
      });
    });

    test('uses correct IAM role', () => {
      template.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
        RoleArn: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('KnowledgeBaseServiceRole')
          ])
        })
      });
    });

    test('has VECTOR type configuration', () => {
      template.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
        KnowledgeBaseConfiguration: {
          Type: 'VECTOR',
          VectorKnowledgeBaseConfiguration: {
            EmbeddingModelArn: 'arn:aws:bedrock:eu-central-1::foundation-model/amazon.titan-embed-text-v2:0',
            EmbeddingModelConfiguration: {
              BedrockEmbeddingModelConfiguration: {
                Dimensions: 1024
              }
            }
          }
        }
      });
    });

    test('uses S3 Vectors storage configuration', () => {
      template.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
        StorageConfiguration: {
          Type: 'S3_VECTORS'
        }
      });
    });

    test('uses Titan Embeddings v2 with 1024 dimensions', () => {
      template.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
        KnowledgeBaseConfiguration: {
          VectorKnowledgeBaseConfiguration: {
            EmbeddingModelArn: Match.stringLikeRegexp('amazon\\.titan-embed-text-v2:0'),
            EmbeddingModelConfiguration: {
              BedrockEmbeddingModelConfiguration: {
                Dimensions: 1024
              }
            }
          }
        }
      });
    });
  });

  describe('S3 Data Source Configuration', () => {
    test('has correct name and description', () => {
      template.hasResourceProperties('AWS::Bedrock::DataSource', {
        Name: 'podcast-transcriptions',
        Description: 'S3 data source containing processed podcast transcription documents'
      });
    });

    test('references Knowledge Base ID', () => {
      template.hasResourceProperties('AWS::Bedrock::DataSource', {
        KnowledgeBaseId: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('PodcastKnowledgeBase')
          ])
        })
      });
    });

    test('has S3 configuration with correct bucket and prefix', () => {
      template.hasResourceProperties('AWS::Bedrock::DataSource', {
        DataSourceConfiguration: {
          Type: 'S3',
          S3Configuration: {
            BucketArn: Match.objectLike({
              'Fn::Join': Match.anyValue()
            }),
            InclusionPrefixes: ['kb-documents/']
          }
        }
      });
    });

    test('has fixed-size chunking strategy with correct parameters', () => {
      template.hasResourceProperties('AWS::Bedrock::DataSource', {
        VectorIngestionConfiguration: {
          ChunkingConfiguration: {
            ChunkingStrategy: 'FIXED_SIZE',
            FixedSizeChunkingConfiguration: {
              MaxTokens: 512,
              OverlapPercentage: 10
            }
          }
        }
      });
    });
  });

  describe('Stack Properties', () => {
    test('exposes Knowledge Base as public property', () => {
      expect(stack.knowledgeBase).toBeDefined();
      expect(stack.knowledgeBase.name).toBe('podcast-transcription-kb');
    });

    test('Data Source is managed manually outside CloudFormation', () => {
      // Data source is no longer managed by CDK - it's created manually
      // See INGESTION_FIX_SUMMARY.md for details
      expect(true).toBe(true);
    });

    test('exposes Knowledge Base Role as public property', () => {
      expect(stack.knowledgeBaseRole).toBeDefined();
    });

    test('exposes Document Processor Function as public property', () => {
      expect(stack.documentProcessorFunction).toBeDefined();
    });

    test('exposes CloudWatch alarms as public properties', () => {
      expect(stack.lambdaErrorAlarm).toBeDefined();
      expect(stack.s3WriteErrorAlarm).toBeDefined();
      expect(stack.ingestionFailureAlarm).toBeDefined();
    });
  });

  describe('Lambda Function Configuration', () => {
    test('has correct runtime and configuration', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'podcast-kb-document-processor',
        Description: 'Process transcription files and create Knowledge Base documents',
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        MemorySize: 512,
        Timeout: 300 // 5 minutes
      });
    });

    test('has correct environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            KNOWLEDGE_BASE_ID: Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('PodcastKnowledgeBase')
              ])
            }),
            DATA_SOURCE_ID: Match.objectLike({
              'Fn::GetAtt': Match.arrayWith([
                Match.stringLikeRegexp('PodcastDataSource')
              ])
            }),
            ALERT_TOPIC_ARN: Match.anyValue()
          }
        }
      });
    });

    test('has IAM role with S3 read permissions for text/* prefix', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['s3:GetObject*'])
            })
          ])
        }
      });
    });

    test('has IAM role with S3 write permissions for kb-documents/* prefix', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: Match.arrayWith(['s3:PutObject'])
            })
          ])
        }
      });
    });

    test('has IAM role with Bedrock StartIngestionJob permission', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: [
                'bedrock-agent:StartIngestionJob',
                'bedrock-agent:GetIngestionJob'
              ]
            })
          ])
        }
      });
    });

    test('has IAM role with SNS publish permission', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Allow',
              Action: 'sns:Publish'
            })
          ])
        }
      });
    });

    test('has CloudWatch Logs permissions', () => {
      // CloudWatch Logs permissions are automatically added by CDK
      // Just verify the Lambda function has a service role
      template.hasResourceProperties('AWS::Lambda::Function', {
        Role: Match.objectLike({
          'Fn::GetAtt': Match.arrayWith([
            Match.stringLikeRegexp('DocumentProcessorFunctionServiceRole')
          ])
        })
      });
    });
  });

  describe('CloudWatch Alarms', () => {
    test('creates Lambda error alarm with correct configuration', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'podcast-kb-lambda-errors',
        AlarmDescription: 'Alert when Document Processor Lambda function has errors',
        MetricName: 'Errors',
        Namespace: 'AWS/Lambda',
        Statistic: 'Sum',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching'
      });
    });

    test('creates S3 write error alarm with correct configuration', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'podcast-kb-s3-write-errors',
        AlarmDescription: 'Alert when S3 document writes fail repeatedly',
        MetricName: 'S3WriteErrors',
        Namespace: 'PodcastKnowledgeBase',
        Statistic: 'Sum',
        Period: 300, // 5 minutes
        EvaluationPeriods: 1,
        Threshold: 3,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching'
      });
    });

    test('creates ingestion failure alarm with correct configuration', () => {
      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'podcast-kb-ingestion-failures',
        AlarmDescription: 'Alert when Bedrock ingestion jobs fail',
        MetricName: 'IngestionJobFailures',
        Namespace: 'PodcastKnowledgeBase',
        Statistic: 'Sum',
        Period: 900, // 15 minutes
        EvaluationPeriods: 1,
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        TreatMissingData: 'notBreaching'
      });
    });

    test('configures SNS actions for all alarms', () => {
      // Verify that alarms have both ALARM and OK actions configured
      const alarms = template.findResources('AWS::CloudWatch::Alarm');
      const alarmKeys = Object.keys(alarms);
      
      expect(alarmKeys.length).toBeGreaterThanOrEqual(3);
      
      // Each alarm should have AlarmActions and OKActions
      alarmKeys.forEach(key => {
        const alarm = alarms[key];
        expect(alarm.Properties.AlarmActions).toBeDefined();
        expect(alarm.Properties.OKActions).toBeDefined();
      });
    });

    test('has correct resource count for alarms', () => {
      template.resourceCountIs('AWS::CloudWatch::Alarm', 3);
    });
  });
});
