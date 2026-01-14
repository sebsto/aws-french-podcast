import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PodcastProcessorIamStack } from '../lib/podcast-processor-iam-stack';
import { PodcastProcessorEventStack } from '../lib/podcast-processor-event-stack';
import { PodcastProcessorWorkflowStack } from '../lib/podcast-processor-workflow-stack';

describe('Podcast Processor Infrastructure', () => {
  let app: cdk.App;
  let iamStack: PodcastProcessorIamStack;
  let eventStack: PodcastProcessorEventStack;
  let workflowStack: PodcastProcessorWorkflowStack;

  beforeEach(() => {
    app = new cdk.App();
    const env = { account: '533267385481', region: 'eu-central-1' };
    
    iamStack = new PodcastProcessorIamStack(app, 'TestIamStack', { env });
    eventStack = new PodcastProcessorEventStack(app, 'TestEventStack', { env });
    workflowStack = new PodcastProcessorWorkflowStack(app, 'TestWorkflowStack', {
      env,
      stepFunctionsRole: iamStack.stepFunctionsRole,
      transcribeRole: iamStack.transcribeRole
    });
  });

  test('IAM Stack creates Step Functions execution role', () => {
    const template = Template.fromStack(iamStack);
    
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'states.amazonaws.com'
          }
        }]
      }
    });
  });

  test('IAM Stack creates Transcribe service role', () => {
    const template = Template.fromStack(iamStack);
    
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [{
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: {
            Service: 'transcribe.amazonaws.com'
          }
        }]
      }
    });
  });

  test('Event Stack creates EventBridge rule for MP3 uploads', () => {
    const template = Template.fromStack(eventStack);
    
    template.hasResourceProperties('AWS::Events::Rule', {
      Description: 'Triggers podcast transcription workflow when MP3 files are uploaded or updated in media/ folder',
      EventPattern: {
        source: ['aws.s3'],
        'detail-type': ['Object Created', 'Object Put'],
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
  });

  test('Event Stack creates EventBridge rule for transcription completion', () => {
    const template = Template.fromStack(eventStack);
    
    template.hasResourceProperties('AWS::Events::Rule', {
      Description: 'Triggers content generation workflow when transcription JSON files are created or updated in text/ folder',
      EventPattern: {
        source: ['aws.s3'],
        'detail-type': ['Object Created', 'Object Put'],
        detail: {
          bucket: {
            name: ['aws-french-podcast-media']
          },
          object: {
            key: [{
              prefix: 'text/'
            }]
          }
        }
      }
    });
  });

  test('Workflow Stack creates Express Step Functions state machines', () => {
    const template = Template.fromStack(workflowStack);
    
    // Should have two Express state machines (transcription and content generation)
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 2);
    
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineType: 'EXPRESS'
    });
  });

  test('Workflow Stack creates SNS topic', () => {
    const template = Template.fromStack(workflowStack);
    
    template.hasResourceProperties('AWS::SNS::Topic', {
      DisplayName: 'Podcast Episode Processing Notifications'
    });
  });

  test('Workflow Stack creates SNS email subscription', () => {
    const template = Template.fromStack(workflowStack);
    
    template.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'stormacq@amazon.com'
    });
  });
});
