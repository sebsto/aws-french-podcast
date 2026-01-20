import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as path from 'path';
import { Construct } from 'constructs';

export interface PodcastKnowledgeBaseStackProps extends cdk.StackProps {
  alertTopic: sns.Topic;
}

export class PodcastKnowledgeBaseStack extends cdk.Stack {
  public readonly knowledgeBase: bedrock.CfnKnowledgeBase;
  // Data source is managed manually outside CloudFormation (see note below)
  // public readonly dataSource: bedrock.CfnDataSource;
  public readonly knowledgeBaseRole: iam.Role;
  public readonly documentProcessorFunction: lambda.Function;
  public readonly lambdaErrorAlarm: cloudwatch.Alarm;
  public readonly s3WriteErrorAlarm: cloudwatch.Alarm;
  public readonly ingestionFailureAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: PodcastKnowledgeBaseStackProps) {
    super(scope, id, props);

    // Reference to existing S3 bucket for data source (documents)
    const mediaBucket = s3.Bucket.fromBucketName(
      this,
      'MediaBucket',
      'aws-french-podcast-media'
    );

    // ============================================================================
    // MANUAL SETUP REQUIRED
    // ============================================================================
    // Due to CloudFormation limitations with S3 Vectors and data source recreation,
    // the following resources must be created manually BEFORE deploying this stack:
    //
    // 1. S3 Vector Bucket: french-podcast-kb-vectors-533267385481
    // 2. Vector Index: podcast-kb-vector-index (with non-filterable metadata keys)
    // 3. Data Source: CVHXBD68AY (managed outside CloudFormation)
    //
    // The vector index MUST be created with non-filterable metadata keys:
    //   - AMAZON_BEDROCK_TEXT
    //   - AMAZON_BEDROCK_METADATA
    //
    // See scripts/bulk-knowledge-base-ingestion/create-index-request.json for the
    // exact configuration used to create the vector index.
    //
    // The data source is managed manually because it was recreated after the initial
    // deployment to fix metadata size issues. Managing it outside CloudFormation
    // prevents data loss during stack updates.
    // ============================================================================

    // Reference the manually created S3 vector bucket
    // The bucket must be created before deploying this stack (see BEDROCK_KB_SETUP.md)
    const vectorBucketName = `french-podcast-kb-vectors-${this.account}`;
    const vectorBucketArn = `arn:aws:s3vectors:${this.region}:${this.account}:bucket/${vectorBucketName}`;
    const vectorIndexName = 'podcast-kb-vector-index';
    const vectorIndexArn = `${vectorBucketArn}/index/${vectorIndexName}`;

    // IAM role for Bedrock Knowledge Base to access S3 and invoke models
    this.knowledgeBaseRole = new iam.Role(this, 'KnowledgeBaseServiceRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      description: 'Service role for Bedrock Knowledge Base to access S3 and invoke embedding models',
      inlinePolicies: {
        KnowledgeBasePolicy: new iam.PolicyDocument({
          statements: [
            // Read access to kb-documents prefix in data source bucket
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:ListBucket'
              ],
              resources: [
                mediaBucket.bucketArn,
                `${mediaBucket.bucketArn}/kb-documents/*`
              ]
            }),
            // Full access to vector bucket for storing embeddings
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3vectors:PutVectors',
                's3vectors:GetVectors',
                's3vectors:QueryVectors',
                's3vectors:DeleteVectors',
                's3vectors:ListVectors'
              ],
              resources: [
                vectorBucketArn,
                `${vectorBucketArn}/*`
              ]
            }),
            // Invoke Titan Embeddings model
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'bedrock:InvokeModel'
              ],
              resources: [
                `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`
              ]
            })
          ]
        })
      }
    });

    // Create Bedrock Knowledge Base with S3 Vectors storage
    // References the manually created vector bucket and index
    this.knowledgeBase = new bedrock.CfnKnowledgeBase(this, 'PodcastKnowledgeBase', {
      name: 'podcast-transcription-kb',
      description: 'Knowledge Base for semantic search across podcast episode transcriptions',
      roleArn: this.knowledgeBaseRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
          embeddingModelConfiguration: {
            bedrockEmbeddingModelConfiguration: {
              dimensions: 1024
            }
          }
        }
      },
      storageConfiguration: {
        type: 'S3_VECTORS',
        s3VectorsConfiguration: {
          vectorBucketArn: vectorBucketArn,
          indexArn: vectorIndexArn
        }
      } as any
    });

    // Use escape hatch to ensure s3VectorsConfiguration is included with correct property names
    this.knowledgeBase.addPropertyOverride('StorageConfiguration.S3VectorsConfiguration', {
      VectorBucketArn: vectorBucketArn,
      IndexArn: vectorIndexArn
    });

    // ============================================================================
    // DATA SOURCE - MANAGED MANUALLY
    // ============================================================================
    // The data source is managed manually outside CloudFormation to prevent data loss
    // during stack updates. The data source was recreated after initial deployment
    // to fix metadata size issues (see INGESTION_FIX_SUMMARY.md).
    //
    // Current Data Source ID: CVHXBD68AY
    // Knowledge Base ID: OT4JU2FZZF
    //
    // To recreate the data source manually:
    // aws bedrock-agent create-data-source \
    //   --knowledge-base-id OT4JU2FZZF \
    //   --name podcast-transcriptions \
    //   --description "S3 data source containing processed podcast transcription documents" \
    //   --data-source-configuration '{
    //     "type": "S3",
    //     "s3Configuration": {
    //       "bucketArn": "arn:aws:s3:::aws-french-podcast-media",
    //       "inclusionPrefixes": ["kb-documents/"]
    //     }
    //   }' \
    //   --vector-ingestion-configuration '{
    //     "chunkingConfiguration": {
    //       "chunkingStrategy": "FIXED_SIZE",
    //       "fixedSizeChunkingConfiguration": {
    //         "maxTokens": 512,
    //         "overlapPercentage": 10
    //       }
    //     }
    //   }' \
    //   --profile podcast --region eu-central-1
    // ============================================================================

    // Hardcoded data source ID (managed manually)
    const dataSourceId = 'CVHXBD68AY';

    // Create S3 data source for the Knowledge Base
    // COMMENTED OUT: Data source is managed manually outside CloudFormation
    // this.dataSource = new bedrock.CfnDataSource(this, 'PodcastDataSource', {
    //   name: 'podcast-transcriptions',
    //   description: 'S3 data source containing processed podcast transcription documents',
    //   knowledgeBaseId: this.knowledgeBase.attrKnowledgeBaseId,
    //   dataSourceConfiguration: {
    //     type: 'S3',
    //     s3Configuration: {
    //       bucketArn: mediaBucket.bucketArn,
    //       inclusionPrefixes: ['kb-documents/']
    //     }
    //   },
    //   vectorIngestionConfiguration: {
    //     chunkingConfiguration: {
    //       chunkingStrategy: 'FIXED_SIZE',
    //       fixedSizeChunkingConfiguration: {
    //         maxTokens: 512,
    //         overlapPercentage: 10
    //       }
    //     }
    //   }
    // });

    // Lambda function for document processing
    this.documentProcessorFunction = new lambda.Function(this, 'DocumentProcessorFunction', {
      functionName: 'podcast-kb-document-processor',
      description: 'Process transcription files and create Knowledge Base documents',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/document-processor')),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        KNOWLEDGE_BASE_ID: this.knowledgeBase.attrKnowledgeBaseId,
        DATA_SOURCE_ID: dataSourceId,  // Hardcoded - managed manually
        ALERT_TOPIC_ARN: props.alertTopic.topicArn
      }
    });

    // Grant S3 read access to text/* prefix (transcription files)
    mediaBucket.grantRead(this.documentProcessorFunction, 'text/*');

    // Grant S3 write access to kb-documents/* prefix (processed documents)
    mediaBucket.grantWrite(this.documentProcessorFunction, 'kb-documents/*');

    // Grant Bedrock StartIngestionJob permission
    // Note: StartIngestionJob is authorized on the Knowledge Base ARN
    this.documentProcessorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'bedrock:StartIngestionJob',
          'bedrock:GetIngestionJob'
        ],
        resources: [
          // Knowledge Base ARN
          `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${this.knowledgeBase.attrKnowledgeBaseId}`
        ]
      })
    );

    // Grant SNS publish permission to alert topic
    props.alertTopic.grantPublish(this.documentProcessorFunction);

    // CloudWatch Logs permissions are automatically added by CDK

    // CloudFormation outputs for Knowledge Base ID and ARN
    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: this.knowledgeBase.attrKnowledgeBaseId,
      description: 'ID of the Bedrock Knowledge Base',
      exportName: 'PodcastKnowledgeBaseId'
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseArn', {
      value: this.knowledgeBase.attrKnowledgeBaseArn,
      description: 'ARN of the Bedrock Knowledge Base',
      exportName: 'PodcastKnowledgeBaseArn'
    });

    new cdk.CfnOutput(this, 'DataSourceId', {
      value: dataSourceId,
      description: 'ID of the S3 data source (managed manually)',
      exportName: 'PodcastDataSourceId'
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseRoleArn', {
      value: this.knowledgeBaseRole.roleArn,
      description: 'ARN of the Knowledge Base service role'
    });

    new cdk.CfnOutput(this, 'VectorBucketName', {
      value: vectorBucketName,
      description: 'Name of the S3 vector bucket storing vector embeddings (manually created)',
      exportName: 'PodcastVectorBucketName'
    });

    new cdk.CfnOutput(this, 'DocumentProcessorFunctionArn', {
      value: this.documentProcessorFunction.functionArn,
      description: 'ARN of the Document Processor Lambda function',
      exportName: 'PodcastDocumentProcessorFunctionArn'
    });

    new cdk.CfnOutput(this, 'DocumentProcessorFunctionName', {
      value: this.documentProcessorFunction.functionName,
      description: 'Name of the Document Processor Lambda function'
    });

    // CloudWatch Alarms for monitoring

    // Alarm 1: Lambda function errors (threshold: 1 in 5 minutes)
    const lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      alarmName: 'podcast-kb-lambda-errors',
      alarmDescription: 'Alert when Document Processor Lambda function has errors',
      metric: this.documentProcessorFunction.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Alarm 2: S3 write errors (threshold: 3 in 5 minutes)
    // We'll use a custom metric filter on Lambda logs to track S3 write failures
    const s3WriteErrorMetric = new cloudwatch.Metric({
      namespace: 'PodcastKnowledgeBase',
      metricName: 'S3WriteErrors',
      dimensionsMap: {
        FunctionName: this.documentProcessorFunction.functionName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5)
    });

    const s3WriteErrorAlarm = new cloudwatch.Alarm(this, 'S3WriteErrorAlarm', {
      alarmName: 'podcast-kb-s3-write-errors',
      alarmDescription: 'Alert when S3 document writes fail repeatedly',
      metric: s3WriteErrorMetric,
      threshold: 3,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Alarm 3: Ingestion job failures (threshold: 1 in 15 minutes)
    // We'll use a custom metric filter on Lambda logs to track ingestion job failures
    const ingestionFailureMetric = new cloudwatch.Metric({
      namespace: 'PodcastKnowledgeBase',
      metricName: 'IngestionJobFailures',
      dimensionsMap: {
        FunctionName: this.documentProcessorFunction.functionName
      },
      statistic: 'Sum',
      period: cdk.Duration.minutes(15)
    });

    const ingestionFailureAlarm = new cloudwatch.Alarm(this, 'IngestionFailureAlarm', {
      alarmName: 'podcast-kb-ingestion-failures',
      alarmDescription: 'Alert when Bedrock ingestion jobs fail',
      metric: ingestionFailureMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Store alarms for SNS configuration in next subtask
    this.lambdaErrorAlarm = lambdaErrorAlarm;
    this.s3WriteErrorAlarm = s3WriteErrorAlarm;
    this.ingestionFailureAlarm = ingestionFailureAlarm;

    // Configure SNS notifications for alarms
    // Add alarm actions for both ALARM and OK states
    const snsAction = new cloudwatch_actions.SnsAction(props.alertTopic);

    lambdaErrorAlarm.addAlarmAction(snsAction);
    lambdaErrorAlarm.addOkAction(snsAction);

    s3WriteErrorAlarm.addAlarmAction(snsAction);
    s3WriteErrorAlarm.addOkAction(snsAction);

    ingestionFailureAlarm.addAlarmAction(snsAction);
    ingestionFailureAlarm.addOkAction(snsAction);
  }
}
