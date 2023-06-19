import { Stack, StackProps } from "aws-cdk-lib";
import { Alias, CfnParametersCode, Code, Function, IFunction, Runtime, Version } from 'aws-cdk-lib/aws-lambda';
import { LambdaDeploymentConfig, LambdaDeploymentGroup } from "aws-cdk-lib/aws-codedeploy";
import { Construct } from "constructs";

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

      // deployment group
      // useful for devOps, e.g: canary deploy
      // reference: https://dev.to/ryands17/canary-deployment-of-lambdas-using-cdk-pipelines-1l0b
      // new LambdaDeploymentGroup(this, 'DeploymentGroup', {
      //   alias: lambdaAlias,
      //   deploymentConfig: LambdaDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTE,
      // });

  }


}
