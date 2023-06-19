import { Stack, StackProps, Stage, StageProps } from "aws-cdk-lib";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CloudFormationCreateUpdateStackAction, CodeBuildAction, CodeStarConnectionsSourceAction, LambdaInvokeAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Code, CfnParametersCode } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { DailySchoolFoodNotificationAppStack } from "./daily-school-food-notification-app-stack";


export interface DailySchoolFoodNotificationPipelineStackProps extends StackProps {
  readonly lambdaCode: CfnParametersCode;
}

export class DailySchoolFoodNotificationCodePipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: DailySchoolFoodNotificationPipelineStackProps) {
      super(scope, id, props);

      const dailySchoolFoodNotificationCodepipeline = new Pipeline(this, 'Pipeline', {
        pipelineName: 'dailySchoolFoodNotificationProdCodePipeline',
      });

      //1. Source Stage
      // 1.1 Infra Source
      const cdkSourceOutput = new Artifact();
      const cdkSourceAction = new CodeStarConnectionsSourceAction({
        actionName: 'Get_Cdk_Source',
        owner: 'abdullah5abid',
        repo: 'Carma-tech-demo',
        connectionArn: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
        output: cdkSourceOutput,
        branch: 'apigatewaay',
      });

      // 1.2 App Source
      const appSourceArtifact = new Artifact();
      const appSourceAction = new CodeStarConnectionsSourceAction({
        actionName: 'Get_App_Source',
        owner: 'abdullah5abid',
        repo: 'internal',
        connectionArn: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
        output: appSourceArtifact,
        branch: 'master',
      });


      dailySchoolFoodNotificationCodepipeline.addStage({
          stageName: "Source",
          actions: [cdkSourceAction, appSourceAction],
      });


      // 2. Build Stage
      // 2.1 synthesize the Lambda CDK template, using CodeBuild
      // the below values are just examples, assuming your CDK code is in TypeScript/JavaScript -
      // adjust the build environment and/or commands accordingly
      const cdkBuildProject = new PipelineProject(this, 'CdkBuildProject', {
        environment: {
          buildImage: LinuxBuildImage.STANDARD_6_0,
        },
        buildSpec: BuildSpec.fromObject({
          version: '0.2',
          phases: {
            install: {
              commands: 'npm install',
            },
            build: {
              commands: [
                'npm ci',
                'npm run build',
                'npm run cdk synth DailySchoolFoodNotificationAppStack -- -o .',
              ],
            },
          },
          artifacts: {
            files: 'DailySchoolFoodNotificationAppStack.template.json',
          },
        }),
      });
      const cdkBuildOutput = new Artifact();
      const cdkBuildAction = new CodeBuildAction({
        actionName: 'CDK_Build',
        project: cdkBuildProject,
        input: cdkSourceOutput,
        outputs: [cdkBuildOutput],
      });



      //Generate a lambda layer artifact to deploy lambda
      const appBuildOutput = new Artifact();
      const appBuildAction = new CodeBuildAction({
          actionName: "APP_BUILD",
          input: appSourceArtifact,
          project: this.createCodeBuildProject(),
          outputs: [appBuildOutput]
      });


      dailySchoolFoodNotificationCodepipeline.addStage({
          stageName: "Build",
          actions: [
            cdkBuildAction,
            appBuildAction
          ],
      });


      // Deploy stage
      // TODO: Add a deploy stage using appBuildOutput.s3Location
      dailySchoolFoodNotificationCodepipeline.addStage({
        stageName: 'Deploy',
        actions: [
            new CloudFormationCreateUpdateStackAction({
              actionName: 'App_CFN_Deploy',
              templatePath: cdkBuildOutput.atPath('DailySchoolFoodNotificationAppStack.template.json'),
              stackName: 'DailySchoolFoodNotificationAppStack',
              adminPermissions: true,
              parameterOverrides: {
                ...props.lambdaCode.assign(appBuildOutput.s3Location),
              },
              extraInputs: [
                appBuildOutput,
              ],
            }),
        ],
      });

  }

  //Creating code build project
  private createCodeBuildProject = (): PipelineProject => {
      const codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
          projectName: 'DailyMenuNotification-Lambda',
          environment: {
              buildImage: LinuxBuildImage.STANDARD_5_0
          },
          buildSpec: BuildSpec.fromObject(this.getBuildSpecContent())
      });

      return codeBuildProject;
  }

  //Creating the build spec content.
  private getBuildSpecContent = () => {
      return {
          version: '0.2',
          phases: {
              install: {
                  'runtime-versions': { python: '3.9' },
                  commands: [
                  ]
              },
              pre_build: {
                  commands: [
                      'echo Pre-build completed'
                  ]
              },
              build: {
                  commands: [
                      'echo Build started on `date`',
                      'pip install --target=./MISC -r MISC/requirements.txt',
                      'echo Build completed on `date`'
                  ]
              },
          },
          artifacts: {
              'base-directory': 'MISC',
              files: [
                  '**/*'
              ],
          }
      }
  };
}
