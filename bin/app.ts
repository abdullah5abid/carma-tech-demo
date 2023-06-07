#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DailyFoodNotificationLambdaPipeline,PipelineStack } from '@lib/pipeline-stack';
// import { DailyFoodNotificationLambdaPipeline } from '@lib/lambda-pipeline-stack';
import { CARMATECH_CONFIG } from '@lib/configuration';

const app = new cdk.App();

const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;
const region = CARMATECH_CONFIG.Prod.REGION;

new PipelineStack(app, 'CarmaTechPipelineStack', {
  env: { account: account, region: region },

});

new DailyFoodNotificationLambdaPipeline(app, 'DailyFoodNotificationLambdaPipeline', {
  env: {
    account: account,
    region: region,
  },
});
app.synth();