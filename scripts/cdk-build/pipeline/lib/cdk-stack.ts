import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';

import { Construct } from 'constructs';

const getGithubConnectionArn = (scope: Construct): string => {
  const account = cdk.Stack.of(scope).account;
  
  switch (account) {
    case '226945380156': // Personal podcast account
      return 'arn:aws:codestar-connections:eu-central-1:226945380156:connection/ab8ad8c1-3e3c-4bae-a728-9d50230fc736';
    case '401955065246': // Development account
      return 'arn:aws:codestar-connections:eu-central-1:401955065246:connection/1a3722f1-bd2f-40d4-badf-accd624640c6';
    case '533267385481': // Old production account
      return 'arn:aws:codestar-connections:us-west-2:533267385481:connection/71d399bc-b280-4066-b56a-03095ff9cc8f';
    default:
      throw new Error(`No GitHub connection ARN configured for account ${account}`);
  }
};

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  
    // Create SNS topic for build failure notifications
    const buildFailureTopic = new sns.Topic(this, 'BuildFailureTopic', {
      topicName: 'aws-french-podcast-build-failures',
      displayName: 'AWS French Podcast Build Failures'
    });

    // Add email subscription
    buildFailureTopic.addSubscription(new subscriptions.EmailSubscription('seb@stormacq.net'));

    // Create the S3 bucket for the podcast website and media
    const websiteBucket = new s3.Bucket(this, 'PodcastBucket', {
      bucketName: 'podcast-stormacq-net',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      eventBridgeEnabled: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Build project using ARM Docker image
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromAsset(this, 'PAEFBuildImage', {
          directory: './docker',
          platform: Platform.LINUX_ARM64,
        }),
        privileged: false,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yaml'),
      projectName: 'FrenchPodcastBuildProject',
    });

    // Grant CodeBuild permission to upload episode-titles.json during build
    websiteBucket.grantWrite(buildProject, 'analytics-state/*');

    // https://github.com/aws/aws-cdk/issues/5517#issuecomment-568596787
    const cfnArmTestProject = buildProject.node.defaultChild as codebuild.CfnProject;
    cfnArmTestProject.addOverride('Properties.Environment.Type', 'ARM_CONTAINER');

    // Create the pipeline
    const pipeline = new codepipeline.Pipeline(this, 'DeploymentPipeline', {
      pipelineName: 'FrenchPodcastPipeline',
      crossAccountKeys: false,
      pipelineType: codepipeline.PipelineType.V2,
      executionMode: codepipeline.ExecutionMode.QUEUED
    });

    // Create artifact objects
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // Add source stage
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: 'sebsto', 
          repo: 'aws-french-podcast', 
          branch: 'main', 
          connectionArn: getGithubConnectionArn(this),
          codeBuildCloneOutput: true,
          output: sourceOutput,
        }),
      ],
    });

    // Add build stage
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Add deployment stage to S3 — deploy under awsfr/site/ prefix
    pipeline.addStage({
      stageName: 'Deploy', 
      actions: [
        new codepipeline_actions.S3DeployAction({
          actionName: 'DeployToS3',
          bucket: websiteBucket,
          input: buildOutput,
          objectKey: 'awsfr/site',
        }),
      ],
    });

    // Create EventBridge rule for pipeline failures
    const pipelineFailureRule = new events.Rule(this, 'PipelineFailureRule', {
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          state: ['FAILED'],
          pipeline: [pipeline.pipelineName]
        }
      }
    });

    // Add SNS topic as target for the rule
    pipelineFailureRule.addTarget(new targets.SnsTopic(buildFailureTopic, {
      message: events.RuleTargetInput.fromText(
        'Podcast en Français pipeline failed!\n\n' +
        'Pipeline: ${detail.pipeline}\n' +
        'Execution ID: ${detail.execution-id}\n' +
        'State: ${detail.state}\n' +
        'Time: ${time}'
      )
    }));

    //
    // CloudFront Logs Bucket
    //

    const logBucket = new s3.Bucket(this, 'CloudFrontLogsBucket', {
      bucketName: 'podcast-stormacq-net-cf-logs',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
    });

    //
    // CloudFront
    //

    // Import ACM certificate (must be in us-east-1)
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', 
      'arn:aws:acm:us-east-1:226945380156:certificate/5d92b935-2b40-462e-8b9a-77810f56b2f9'
    );

    // CloudFront Function for URL rewriting
    // - /awsfr/media/* and /awsfr/img/* → pass through to S3 as-is
    // - /awsfr/* → rewrite to serve from awsfr/site/
    // - / or empty → 302 redirect to /awsfr/
    const urlRewriteFunction = new cloudfront.Function(this, 'UrlRewriteFunction', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Root or empty → redirect to /awsfr/
  if (uri === '/' || uri === '') {
    return {
      statusCode: 302,
      statusDescription: 'Found',
      headers: {
        'location': { value: '/awsfr/' }
      }
    };
  }

  // /awsfr/media/* and /awsfr/img/* → serve directly from S3 (no rewrite needed)
  if (uri.startsWith('/awsfr/media/') || uri.startsWith('/awsfr/img/')) {
    return request;
  }

  // /awsfr/* → rewrite to awsfr/site/*
  if (uri.startsWith('/awsfr/')) {
    request.uri = '/awsfr/site/' + uri.substring(7);
    // Handle trailing slash → append index.html
    if (request.uri.endsWith('/')) {
      request.uri += 'index.html';
    }
    return request;
  }

  // Anything else → redirect to /awsfr/
  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: {
      'location': { value: '/awsfr/' }
    }
  };
}
`),
      functionName: 'podcast-url-rewrite',
      comment: 'Rewrites URLs for podcast.stormacq.net: /awsfr/* to S3 paths',
    });

    // Custom CORS response headers policy for analytics
    const corsPolicy = new cloudfront.ResponseHeadersPolicy(this, 'AnalyticsCorsPolicy', {
      responseHeadersPolicyName: 'podcast-analytics-cors',
      corsBehavior: {
        accessControlAllowOrigins: ['https://podcast.stormacq.net', 'http://localhost:3000', 'http://localhost:8080'],
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowCredentials: false,
        originOverride: true,
      },
    });

    // Create CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: corsPolicy,
        functionAssociations: [{
          function: urlRewriteFunction,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      domainNames: ['podcast.stormacq.net'],
      certificate: certificate,
      defaultRootObject: '',
      enabled: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      logBucket: logBucket,
      logFilePrefix: 'cloudfront-logs/',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/awsfr/site/index.html',
          ttl: cdk.Duration.seconds(10),
        },
      ],
    });

    // Output the CloudFront distribution domain name (needed for DNS CNAME)
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront distribution domain name — point podcast.stormacq.net CNAME here',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket name',
    });

    //
    // Analytics Pipeline
    //

    // Lambda function for processing CloudFront logs
    const analyticsLambda = new lambda.Function(this, 'AnalyticsProcessor', {
      functionName: 'podcast-analytics-processor',
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'handler.main',
      code: lambda.Code.fromAsset('./lambda/analytics', {
        bundling: {
          image: lambda.Runtime.PYTHON_3_12.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output',
          ],
        },
      }),
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        LOG_BUCKET: logBucket.bucketName,
        LOG_PREFIX: 'cloudfront-logs/',
        WEBSITE_BUCKET: websiteBucket.bucketName,
        OUTPUT_KEY: 'awsfr/site/data/analytics.json',
        STATE_PREFIX: 'analytics-state/',
        SNS_TOPIC_ARN: buildFailureTopic.topicArn,
      },
    });

    // Permissions
    logBucket.grantRead(analyticsLambda);
    websiteBucket.grantReadWrite(analyticsLambda, 'awsfr/site/data/*');
    websiteBucket.grantReadWrite(analyticsLambda, 'analytics-state/*');
    buildFailureTopic.grantPublish(analyticsLambda);

    // SSM parameter access for OP3 API token (SecureString - read at runtime, not deploy time)
    analyticsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/podcast/op3-api-token`],
    }));
    analyticsLambda.addEnvironment('OP3_TOKEN_PARAM', '/podcast/op3-api-token');
    analyticsLambda.addEnvironment('OP3_SHOW_UUID', '82002a7f8d7e4ac29715b95b110c9339');

    // Daily trigger at 04:00 UTC
    new events.Rule(this, 'DailyAnalyticsRule', {
      ruleName: 'podcast-analytics-daily',
      schedule: events.Schedule.cron({ hour: '4', minute: '0' }),
      targets: [new targets.LambdaFunction(analyticsLambda)],
    });

    // CloudWatch alarm for Lambda errors
    const errorAlarm = analyticsLambda.metricErrors({
      period: cdk.Duration.hours(24),
    }).createAlarm(this, 'AnalyticsErrorAlarm', {
      alarmName: 'podcast-analytics-processor-errors',
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    errorAlarm.addAlarmAction(new cw_actions.SnsAction(buildFailureTopic));
  }
}
