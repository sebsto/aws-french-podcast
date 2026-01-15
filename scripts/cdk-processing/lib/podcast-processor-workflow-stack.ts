import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';

import { Construct } from 'constructs';

export interface PodcastProcessorWorkflowStackProps extends cdk.StackProps {
  stepFunctionsRole: iam.Role;
  transcribeRole: iam.Role;
}

export class PodcastProcessorWorkflowStack extends cdk.Stack {
  public readonly transcriptionStateMachine: stepfunctions.StateMachine;
  public readonly contentGenerationStateMachine: stepfunctions.StateMachine;
  public readonly notificationTopic: sns.Topic;
  public readonly alertTopic: sns.Topic;
  public readonly contentGeneratorFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: PodcastProcessorWorkflowStackProps) {
    super(scope, id, props);

    // SNS topic for email notifications
    this.notificationTopic = new sns.Topic(this, 'PodcastNotificationTopic', {
      displayName: 'Podcast Episode Processing Notifications'
    });

    // Subscribe email address to the topic
    this.notificationTopic.addSubscription(
      new subscriptions.EmailSubscription('stormacq@amazon.com')
    );

    // SNS topic for critical system alerts
    this.alertTopic = new sns.Topic(this, 'PodcastSystemAlertTopic', {
      displayName: 'Podcast System Critical Alerts'
    });

    // Subscribe email address to the alert topic
    this.alertTopic.addSubscription(
      new subscriptions.EmailSubscription('stormacq@amazon.com')
    );

    // Create Lambda function for content generation with Bedrock
    this.contentGeneratorFunction = new lambda.Function(this, 'ContentGeneratorFunction', {
      functionName: 'podcast-content-generator',
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {

  console.log(JSON.stringify(event))
  console.log('Processing content generation for:', JSON.stringify(event, null, 2));

  try {
    // Validate input parameters
    if (!event.bucket || !event.key) {
      throw new Error('Missing required parameters: bucket and key must be provided');
    }

    // Fetch transcript content from S3
    console.log('Fetching transcript from S3...');
    const getObjectCommand = new GetObjectCommand({
      Bucket: event.bucket,
      Key: event.key
    });

    const s3Response = await s3Client.send(getObjectCommand);
    const transcriptContent = await s3Response.Body.transformToString();
    const transcriptJson = JSON.parse(transcriptContent);
    
    // Extract the transcript text
    const transcriptText = transcriptJson.results.transcripts[0].transcript;
    console.log('Successfully fetched transcript, length:', transcriptText.length);

    // Prepare the prompt for Bedrock
    const prompt = \`Tu es le producteur du podcast AWS en français. Analyse cette transcription d'épisode:

\${transcriptText}

Écris la description de cet épisode qui accompagnera l'épisode dans les applications de podcast et sur le site web. Propose aussi deux ou trois titres qui donnent envie d'écouter cet épisode. Écrit aussi deux descriptions pour partager l'épisode du jour sur les réseaux sociaux. Une version pour LinkedIn et une courte (200 caractères maximum) pour Twitter. Utilise un ton factuel et neutre. La plupart des nouveautés ne sont pas "des innovations qui vont révolutionner" quoi que ce soit. Tu parles à un public tech qui n'aime pas le bullshit ou les emphases non nécessaires. N'utilise pas de bullet point, plutôt un narratif. Fais une utilisation raisonnable des émojis dans les messages pour les réseaux sociaux. IMPORTANT: Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans balises de code, sans texte avant ou après. Utilise exactement cette structure : {"titles":["Titre 1","Titre 2","Titre 3"],"description":"Description narrative de l'épisode","social_media":{"linkedin":"Version LinkedIn","twitter":"Version Twitter (max 200 caractères)"}}\`;

    // Call Bedrock
    console.log('Calling Bedrock...');
    const bedrockRequest = {
      messages: [
        {
          role: 'user',
          content: [ {"text": prompt}]
        }
      ]
    };

    const invokeCommand = new InvokeModelCommand({
      modelId: 'eu.amazon.nova-2-lite-v1:0',
      body: JSON.stringify(bedrockRequest),
      contentType: 'application/json',
      accept: '*/*'
    });

    const bedrockResponse = await bedrockClient.send(invokeCommand);
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    console.log(JSON.stringify(responseBody))
    
    // Extract the text content from Bedrock response
    let generatedText = responseBody.output.message.content[0].text;
    
    // Strip markdown code block wrapper if present (triple backticks)
    if (generatedText.startsWith('\`\`\`')) {
      const lines = generatedText.split('\\n');
      // Remove first line (opening backticks) and last line (closing backticks)
      generatedText = lines.slice(1, -1).join('\\n').trim();
    }
    
    // Validate it's valid JSON before returning
    JSON.parse(generatedText); // This will throw if invalid
    
    console.log('Successfully generated content with Bedrock');

    return {
      generatedContent: generatedText,
      transcriptKey: event.key,
      bucket: event.bucket,
      success: true
    };

  } catch (error) {
    console.error('Error in content generation:', error);
    throw new Error(\`Failed to generate content: \${error instanceof Error ? error.message : 'Unknown error'}\`);
  }
};
      `),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512
    });

    // Grant the Lambda function permissions for S3 and Bedrock
    this.contentGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::aws-french-podcast-media/text/*']
    }));

    this.contentGeneratorFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel'],
      resources: ['*']
    }));

    // CloudWatch Log Group for Transcription Step Functions
    const transcriptionLogGroup = new logs.LogGroup(this, 'PodcastTranscriptionLogGroup', {
      logGroupName: '/aws/stepfunctions/podcast-transcription',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // CloudWatch Log Group for Content Generation Step Functions
    const contentGenerationLogGroup = new logs.LogGroup(this, 'PodcastContentGenerationLogGroup', {
      logGroupName: '/aws/stepfunctions/podcast-content-generation',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Create transcription workflow (Express - for cost efficiency and speed)
    const transcriptionDefinition = this.createTranscriptionWorkflowDefinition(props.transcribeRole);
    
    this.transcriptionStateMachine = new stepfunctions.StateMachine(this, 'PodcastTranscriptionStateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(transcriptionDefinition),
      role: props.stepFunctionsRole,
      stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: transcriptionLogGroup,
        level: stepfunctions.LogLevel.ERROR,
        includeExecutionData: false
      }
    });

    // Create content generation workflow (Express - for cost efficiency and speed)
    const contentGenerationDefinition = this.createContentGenerationWorkflowDefinition();
    
    this.contentGenerationStateMachine = new stepfunctions.StateMachine(this, 'PodcastContentGenerationStateMachine', {
      definitionBody: stepfunctions.DefinitionBody.fromChainable(contentGenerationDefinition),
      role: props.stepFunctionsRole,
      stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      timeout: cdk.Duration.minutes(5),
      logs: {
        destination: contentGenerationLogGroup,
        level: stepfunctions.LogLevel.ERROR,
        includeExecutionData: false
      }
    });

    // CloudWatch Alarms for critical failures
    this.createCloudWatchAlarms();

    // Output important ARNs
    new cdk.CfnOutput(this, 'TranscriptionStateMachineArn', {
      value: this.transcriptionStateMachine.stateMachineArn,
      description: 'ARN of the podcast transcription Step Functions state machine'
    });

    new cdk.CfnOutput(this, 'ContentGenerationStateMachineArn', {
      value: this.contentGenerationStateMachine.stateMachineArn,
      description: 'ARN of the podcast content generation Step Functions state machine'
    });

    new cdk.CfnOutput(this, 'NotificationTopicArn', {
      value: this.notificationTopic.topicArn,
      description: 'ARN of the SNS notification topic'
    });

    new cdk.CfnOutput(this, 'TranscriptionLogGroupName', {
      value: transcriptionLogGroup.logGroupName,
      description: 'CloudWatch Log Group for transcription Step Functions execution logs'
    });

    new cdk.CfnOutput(this, 'ContentGenerationLogGroupName', {
      value: contentGenerationLogGroup.logGroupName,
      description: 'CloudWatch Log Group for content generation Step Functions execution logs'
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'ARN of the SNS topic for critical system alerts'
    });

    new cdk.CfnOutput(this, 'ContentGeneratorFunctionArn', {
      value: this.contentGeneratorFunction.functionArn,
      description: 'ARN of the Lambda function for content generation with Bedrock'
    });
  }

  private createCloudWatchAlarms(): void {
    // Alarm for transcription workflow failures
    const transcriptionFailureAlarm = new cloudwatch.Alarm(this, 'TranscriptionWorkflowFailureAlarm', {
      alarmName: 'podcast-transcription-workflow-failures',
      alarmDescription: 'Alarm when transcription workflow executions fail',
      metric: this.transcriptionStateMachine.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Alarm for content generation workflow failures
    const contentGenerationFailureAlarm = new cloudwatch.Alarm(this, 'ContentGenerationWorkflowFailureAlarm', {
      alarmName: 'podcast-content-generation-workflow-failures',
      alarmDescription: 'Alarm when content generation workflow executions fail',
      metric: this.contentGenerationStateMachine.metricFailed({
        period: cdk.Duration.minutes(5),
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Add SNS actions to alarms
    const snsAction = new cloudwatchActions.SnsAction(this.alertTopic);
    
    transcriptionFailureAlarm.addAlarmAction(snsAction);
    transcriptionFailureAlarm.addOkAction(snsAction);
    
    contentGenerationFailureAlarm.addAlarmAction(snsAction);
    contentGenerationFailureAlarm.addOkAction(snsAction);
  }

  private createTranscriptionWorkflowDefinition(transcribeRole: iam.Role): stepfunctions.Chain {
    // Extract basic information from MP3 upload event
    const extractBasicInfo = new stepfunctions.Pass(this, 'ExtractBasicInfo', {
      comment: 'Extract basic information from MP3 upload event',
      parameters: {
        'executionId.$': '$$.Execution.Name',
        'inputBucket.$': '$.bucket.name',
        'inputKey.$': '$.object.key',
        'filename.$': 'States.ArrayGetItem(States.StringSplit($.object.key, \'/\'), 1)'
      }
    });

    // Extract episode number from filename
    const extractEpisodeNumber = new stepfunctions.Pass(this, 'ExtractEpisodeNumber', {
      comment: 'Parse episode number from filename',
      parameters: {
        'executionId.$': '$.executionId',
        'inputBucket.$': '$.inputBucket',
        'inputKey.$': '$.inputKey',
        'filename.$': '$.filename',
        'episodeNumber.$': 'States.ArrayGetItem(States.StringSplit($.filename, \'.\'), 0)'
      }
    });

    // Start Transcription Job
    const startTranscriptionJob = new stepfunctions.CustomState(this, 'StartTranscriptionJob', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::aws-sdk:transcribe:startTranscriptionJob',
        Parameters: {
          'TranscriptionJobName.$': '$.executionId',
          'LanguageCode': 'fr-FR',
          'MediaFormat': 'mp3',
          'Media': {
            'MediaFileUri.$': 'States.Format(\'s3://{}/{}\', $.inputBucket, $.inputKey)'
          },
          'OutputBucketName.$': '$.inputBucket',
          'OutputKey.$': 'States.Format(\'text/{}-transcribe.json\', $.episodeNumber)',
          'Settings': {
            'ShowSpeakerLabels': false
          },
          'JobExecutionSettings': {
            'AllowDeferredExecution': false,
            'DataAccessRoleArn': transcribeRole.roleArn
          }
        },
        ResultPath: '$.transcriptionJob',
        Retry: [
          {
            ErrorEquals: ['States.TaskFailed'],
            IntervalSeconds: 30,
            MaxAttempts: 3,
            BackoffRate: 2.0
          }
        ]
      }
    });

    // Send transcription started notification
    const notifyTranscriptionStarted = new stepfunctions.CustomState(this, 'NotifyTranscriptionStarted', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::sns:publish',
        Parameters: {
          'TopicArn': this.notificationTopic.topicArn,
          'Subject': 'Podcast Transcription Started',
          'Message.$': '$.inputKey'
        },
        End: true
      }
    });

    return stepfunctions.Chain.start(extractBasicInfo)
      .next(extractEpisodeNumber)
      .next(startTranscriptionJob)
      .next(notifyTranscriptionStarted);
  }

  private createContentGenerationWorkflowDefinition(): stepfunctions.Chain {
    // Extract information from transcription file creation event
    const startContentGeneration = new stepfunctions.Pass(this, 'StartContentGeneration', {
      comment: 'Extract information from transcription file creation event and parse episode number',
      parameters: {
        'executionId.$': '$$.Execution.Name',
        'inputBucket.$': '$.bucket.name',
        'transcriptionKey.$': '$.object.key',
        'episodeNumber.$': 'States.ArrayGetItem(States.StringSplit(States.ArrayGetItem(States.StringSplit($.object.key, \'/\'), 1), \'-\'), 0)',
        'originalMp3Key.$': 'States.Format(\'media/{}.mp3\', States.ArrayGetItem(States.StringSplit(States.ArrayGetItem(States.StringSplit($.object.key, \'/\'), 1), \'-\'), 0))',

      }
    });

    // Generate content using Lambda function (handles S3 fetch + Bedrock)
    const generateContent = new stepfunctions.CustomState(this, 'GenerateContentWithLambda', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          'FunctionName': this.contentGeneratorFunction.functionName,
          'Payload': {
            'bucket.$': '$.inputBucket',
            'key.$': '$.transcriptionKey'
          }
        },
        ResultPath: '$.contentResult',
        Retry: [
          {
            ErrorEquals: ['States.TaskFailed'],
            IntervalSeconds: 30,
            MaxAttempts: 2,
            BackoffRate: 2.0
          }
        ]
      }
    });

    // Extract generated content from Lambda response
    const extractGeneratedContent = new stepfunctions.Pass(this, 'ExtractGeneratedContent', {
      comment: 'Extract the generated content from Lambda response',
      parameters: {
        'executionId.$': '$.executionId',
        'inputBucket.$': '$.inputBucket',
        'transcriptionKey.$': '$.transcriptionKey',
        'originalMp3Key.$': '$.originalMp3Key',
        'episodeNumber.$': '$.episodeNumber',
        'generatedContentText.$': '$.contentResult.Payload.generatedContent',
        'parsedContent.$': 'States.StringToJson($.contentResult.Payload.generatedContent)'
      }
    });

    // Send comprehensive email notification
    const sendFinalNotification = new stepfunctions.CustomState(this, 'SendFinalNotification', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::sns:publish',
        Parameters: {
          'TopicArn': this.notificationTopic.topicArn,
          'Subject': 'Podcast Episode Processing Complete',
          'Message.$': 'States.Format(\'Épisode de podcast traité avec succès !\n\nFichier original: {}\nFichier de transcription: {}\n\n=== TITRES SUGGÉRÉS ===\n{}\n\n=== DESCRIPTION ===\n{}\n\n=== CONTENU RÉSEAUX SOCIAUX ===\nLinkedIn: {}\nTwitter: {}\n\n=== CONTENU BRUT ===\n{}\', $.originalMp3Key, $.transcriptionKey, $.parsedContent.titles, $.parsedContent.description, $.parsedContent.social_media.linkedin, $.parsedContent.social_media.twitter, $.generatedContentText)'
        },
        End: true
      }
    });

    return stepfunctions.Chain.start(startContentGeneration)
      .next(generateContent)
      .next(extractGeneratedContent)
      .next(sendFinalNotification);
  }
}