import { CfnOutput, Stack, StackProps } from "aws-cdk-lib";
import { Alias, CfnParametersCode, Code, Function, IFunction, Runtime, Version } from 'aws-cdk-lib/aws-lambda';
import { LambdaDeploymentConfig, LambdaDeploymentGroup } from "aws-cdk-lib/aws-codedeploy";
import { Construct } from "constructs";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";

export interface DailySchoolFoodNotificationAppStackProps extends StackProps {
  readonly lambdaCode?: Code;
}


/* App stack, A.k.a: lambda stack */
export class DailySchoolFoodNotificationAppStack extends Stack {
  public readonly function: IFunction;

  constructor(scope: Construct, id: string, props: DailySchoolFoodNotificationAppStackProps = {}) {
    super(scope, id, props);

    const currentDate = new Date().toISOString();

    const func = new Function(this, 'Lambda', {
      code: props.lambdaCode || Code.fromCfnParameters(),
      handler: 'lambda_function.lambda_handler',
      runtime: Runtime.PYTHON_3_9,
      description: `DailySchoolFoodNotification lambda function generated on: ${currentDate}`,
    });
    this.function = func;

    // Give lambda an Alias
    const lambdaAlias = new Alias(this, 'DailySchoolFoodNotificationLambda-alias', {
      aliasName: 'Prod',
      version: func.currentVersion
    });

    // Create EventBridge Role to schedule the lambda function
    new Rule(this, 'DailySchoolFoodNotificationLambdaSchedule', {
      schedule: Schedule.cron({
        year: '*',
        month: '*',
        day: '*',
        hour: '10', 
        minute: '15', 
      }), // 10:00 PM CDT is 3:00 AM UTC
      targets: [new LambdaFunction(lambdaAlias)], // targeting the Lambda alias
    });

    // Create a new RestApi
    const api = new RestApi(this, 'DailySchoolFoodNotificationApi', {
      restApiName: 'Daily School Food notification Service',
      description: 'This service serves daily school food notifications.',
    });

    // Create a new LambdaIntegration
    const getIntegration = new LambdaIntegration(func, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    // Add an API Gateway resource and method
    api.root.addMethod('GET', getIntegration);

    // Output the API Gateway URL
    new CfnOutput(this, 'ApiUrl', {
      value: api.url,
    });

    // deployment group
    // useful for devOps, e.g: canary deploy
    // reference: https://dev.to/ryands17/canary-deployment-of-lambdas-using-cdk-pipelines-1l0b
    // new LambdaDeploymentGroup(this, 'DeploymentGroup', {
    //   alias: lambdaAlias,
    //   deploymentConfig: LambdaDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTE,
    // });

  }


}
