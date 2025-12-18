#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PodcastProcessorIamStack } from '../lib/podcast-processor-iam-stack';
import { PodcastProcessorEventStack } from '../lib/podcast-processor-event-stack';
import { PodcastProcessorWorkflowStack } from '../lib/podcast-processor-workflow-stack';

const app = new cdk.App();

// Environment configuration for eu-central-1 and account 533267385481
const env = {
  account: '533267385481',
  region: 'eu-central-1'
};

// IAM Stack - Contains roles and policies
const iamStack = new PodcastProcessorIamStack(app, 'PodcastProcessorIamStack', {
  env,
  description: 'IAM roles and policies for podcast episode processor'
});

// Workflow Stack - Contains Step Functions state machine and SNS topic
const workflowStack = new PodcastProcessorWorkflowStack(app, 'PodcastProcessorWorkflowStack', {
  env,
  description: 'Step Functions workflow and SNS notifications for podcast processor',
  stepFunctionsRole: iamStack.stepFunctionsRole,
  transcribeRole: iamStack.transcribeRole
});

// Event Stack - Contains EventBridge rules and S3 event configuration
const eventStack = new PodcastProcessorEventStack(app, 'PodcastProcessorEventStack', {
  env,
  description: 'EventBridge rules and S3 event configuration for podcast processor',
  transcriptionStateMachine: workflowStack.transcriptionStateMachine,
  contentGenerationStateMachine: workflowStack.contentGenerationStateMachine
});

// Add dependencies
workflowStack.addDependency(iamStack);
eventStack.addDependency(workflowStack);
