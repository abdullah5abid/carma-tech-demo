import { Arn, Aws, RemovalPolicy, SecretValue, CfnOutput, Stack, StackProps, Stage, CfnStack, CfnCapabilities } from 'aws-cdk-lib';
import { Construct, DependencyGroup } from 'constructs';
import {
    CodePipeline,
    ShellStep,
    CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { CarmaTechPipelineStage } from '@lib/pipeline-stage';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { CloudFormationCreateReplaceChangeSetAction, CloudFormationCreateUpdateStackAction, CloudFormationExecuteChangeSetAction, CodeBuildAction, CodeStarConnectionsSourceAction, S3DeployAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { BuildSpec, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Effect, ManagedPolicy, Policy, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';



export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const pipelineName = 'CaramaTechInfraDeploymentPipeline';
        const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;

        // Pipeline definition
        const pipeline = new CodePipeline(this, 'CarmaTechInfraPipeline', {
            pipelineName: pipelineName,
            // (NOTE: tonytan4ever, turn this off to skip selfMutating) selfMutation: false,
            synth: new ShellStep('Synth', {
                input: CodePipelineSource.connection(
                    'Carma-tech/Carma-tech-infra',
                    'main',
                    {
                        connectionArn: CARMATECH_CONFIG.Prod.ARN,
                    }
                ),
                commands: [
                    'yarn install --frozen-lockfile',
                    'yarn build',
                    'npx cdk synth',
                ],
            }),
        });

        // Deplpy Prod Stage
        // const prodCarmaTech = new CarmaTechPipelineStage(this, 'Prod', {
        //     env: {
        //         account: CARMATECH_CONFIG.Prod.ACCOUNT_ID,
        //         region: CARMATECH_CONFIG.Prod.REGION,
        //     },
        // });
        // pipeline.addStage(prodCarmaTech);
    }
}

export class DailyFoodNotificationLambdaPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
      ...props,
      env: {
          account: CARMATECH_CONFIG.Prod.ACCOUNT_ID,
          region: CARMATECH_CONFIG.Prod.REGION,
      },
  });

      const githubToken = SecretValue.secretsManager('github-token'); 

      const pipeline = new CodePipeline(this, 'CarmaTechDailyFoodNotificationLambdaPipeline', {
          synth: new ShellStep('Synth', {
              commands: [
                  'npm install',
                  'npm run build',
                  'npx cdk synth',
              ],
              additionalInputs: {
                  LambdaSource: CodePipelineSource.gitHub('abdullah5abid/misc_cdk', 'master', {
                      authentication: githubToken,
                  }),
                  InfraSource: CodePipelineSource.connection('abdullah5abid/carma-tech-demo', 'main', {
                      connectionArn: CARMATECH_CONFIG.Prod.ARN,
                  }),
              },
          }),
      });

      pipeline.addStage(new CarmaTechPipelineStage(this, 'Prod', {
          env: { account: CARMATECH_CONFIG.Prod.ACCOUNT_ID, region: CARMATECH_CONFIG.Prod.REGION }
      }));
  }
}





// export class DailyFoodNotificationLambdaPipeline extends Stack {
//     constructor(scope: Construct, id: string, props?: StackProps) {
//         super(scope, id, props);

//         // Artifact for the source output
//         const sourceOutput = new Artifact();

//         // The source action represents the retrieval of the lambda code from the Carma-tech/internal repo
//         const sourceAction = new CodeStarConnectionsSourceAction({
//             actionName: 'Lambda_Source',
//             connectionArn: CARMATECH_CONFIG.Prod.ARN,
//             owner: 'Carma-tech',
//             repo: 'internal',
//             output: sourceOutput,
//             branch: 'cdk-lambda', // replace with the correct branch name
//         });

//         // CodeBuild project
//         const buildProject = new PipelineProject(this, 'LambdaBuild', {
//             buildSpec: BuildSpec.fromObject({
//                 version: '0.2',
//                 phases: {
//                     install: {
//                         'runtime-versions': {
//                             python: 3.9
//                         },
//                         commands: [
//                             'cd MISC/',
//                             'pip install -r requirements.txt -t .'
//                         ]
//                     },
//                     build: {
//                         commands: [
//                             'zip -r lambda_function.zip .'
//                         ]
//                     }
//                 },
//                 artifacts: {
//                     files: [
//                         'lambda_function.zip'
//                     ]
//                 }
//             }),
//             environment: {
//                 buildImage: LinuxBuildImage.STANDARD_5_0,
//             },
//         });

//         // Build stage
//         const buildAction = new CodeBuildAction({
//             actionName: 'Lambda_Build',
//             project: buildProject,
//             input: sourceOutput,
//             outputs: [new Artifact('BuildOutput')],
//         });

//         const buildOutput = new Artifact('BuildOutput');
//         // Define the action that deploys the CloudFormation template
//         const deployAction = new CloudFormationCreateUpdateStackAction({
//             actionName: 'Lambda_Deploy',
//             templatePath: buildOutput.atPath('template.json'),
//             stackName: 'YourLambdaStack',
//             adminPermissions: true,
//         });


//         // Deploy stage
//         const deployStage = new Stage(this, 'Deploy');

//         // Create pipeline
//         const pipeline = new Pipeline(this, 'DailyFoodNotificationLambdaPipeline', {
//             pipelineName: 'DailyFoodNotificationLambdaPipeline',
//             stages: [
//                 {
//                     stageName: 'Source',
//                     actions: [sourceAction],
//                 },
//                 {
//                     stageName: 'Build',
//                     actions: [buildAction],
//                 },
//                 {
//                     stageName: 'Deploy',
//                     actions: [deployAction], // This will be your deploy actions
//                 },
//             ],
//         });
//     }
// }
