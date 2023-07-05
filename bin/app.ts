#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '@lib/pipeline-stack';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { DailySchoolFoodNotificationAppDemoStack } from '@lib/daily-food-notification-app-stack';
import { CarmaTechInfraStack } from '@lib/carma-tech-infra-stack';
import { CarmaApiDemoStack } from '@lib/carma-tech-api-infra-stack';

const app = new cdk.App();

const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;
const region = CARMATECH_CONFIG.Prod.REGION;


new PipelineStack(app, 'CarmaTechPipelineStack', {
  env: { account: account, region: region },
});


// const cfnParametersCode = Code.fromCfnParameters();

// /*
//  * This is the DailySchoolFoodNotification production CodePipeline Stack.
//  */
// new DailySchoolFoodNotificationCodePipelineStack(app, 'DailySchoolFoodNotificationProdCodePipelineStack', {
//   lambdaCode: cfnParametersCode,
//   env: { account: account, region: region },
// });

// Add the DailySchoolFoodNotification App Stack
const dailySchoolFoodNotificationAppStack = new DailySchoolFoodNotificationAppDemoStack(
  app, 'DailySchoolFoodNotificationAppDemoStack',{
  env: { account: account, region: region },
});

const carmaTechInfraStack = new CarmaTechInfraStack(
  app, 'CarmaTechInfraStack', {
  env: {
    account: account,
    region: region,
  }
});

const carmaApiDemoStack = new CarmaApiDemoStack(
  app, 'CarmaApiDemoStack', {
    env: {
      account: account,
      region: region,
    }
  }
)

app.synth();