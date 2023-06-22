#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '@lib/pipeline-stack';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { Code } from 'aws-cdk-lib/aws-lambda';
import { CarmaTechInfraStack } from '@lib/carma-tech-infra-stack';
import { DailySchoolFoodNotificationAppStack } from '@lib/daily-school-food-notification-app-stack';
import { DailySchoolFoodNotificationCodePipelineStack } from '@lib/daily-school-food-notification-codepipeline-stack';
import { CarmaTechAPIStack } from '@lib/carmatech-api-stack';

const app = new cdk.App();

const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;
const region = CARMATECH_CONFIG.Prod.REGION;


new PipelineStack(app, 'CarmaTechPipelineStack', {
  env: { account: account, region: region },
  description: 'This stack creates a new RDS MySQL database in private subnet',
});


const cfnParametersCode = Code.fromCfnParameters();
new DailySchoolFoodNotificationAppStack(app, 'DailySchoolFoodNotificationAppStack', {
  lambdaCode: cfnParametersCode,
  env: { account: account, region: region },
});

/*
 * This is the DailySchoolFoodNotification production CodePipeline Stack.
 */
new DailySchoolFoodNotificationCodePipelineStack(app, 'DailySchoolFoodNotificationProdCodePipelineStack', {
  lambdaCode: cfnParametersCode,
  env: { account: account, region: region },
});

new CarmaTechAPIStack(app, 'CarmaTechAPIStack', {
  lambdaCode: cfnParametersCode,
  env: { account: account, region: region },
});

app.synth();
