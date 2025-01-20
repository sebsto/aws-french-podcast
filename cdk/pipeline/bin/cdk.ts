#!/opt/homebrew/opt/node/bin/node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/cdk-stack';

const app = new cdk.App();
new PipelineStack(app, 'PAEFPipelineStack', {
  // prod account
  env: { account: '533267385481', region: 'eu-central-1' },
  });