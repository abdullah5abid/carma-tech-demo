import { Construct } from 'constructs';
import { CfnCapabilities, CfnOutput, Duration, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { 
  CodeBuildAction, 
  CloudFormationCreateReplaceChangeSetAction, 
  CloudFormationExecuteChangeSetAction, 
  GitHubSourceAction, 
  GitHubTrigger, 
  CodeStarConnectionsSourceAction
} from 'aws-cdk-lib/aws-codepipeline-actions';
import { ManagedPolicy, Policy, PolicyStatement, Effect, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BuildSpec, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { CARMATECH_CONFIG } from './configuration';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';


export class DailyFoodNotificationLambdaPipeline extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
      super(scope, id, props);

      //Creating s3 Bucket
      const artifactsBucket = new Bucket(this, "S3BucketForPipelineArtifacts");

    //   //Create IAM Role for Lambda Function
    //   const lambdaRole = new Role(this, "lambdaRole", {
    //     assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    //     managedPolicies: [
    //         ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
    //         ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess')
    //     ]
    // });

      //Codepipeline
      const codepipeline = new Pipeline(this, 'CodePipelineForLambdaDeployment', {});

      //Source Stage
      const sourceArtifact = new Artifact();

      const sourceAction = new GitHubSourceAction({
        actionName: 'Lambda_Source',
            owner: 'abdullah5abid',
            repo: 'misc_cdk',
            output: sourceArtifact,
            branch: 'master',
            oauthToken: SecretValue.secretsManager('github-token'),
            trigger: GitHubTrigger.WEBHOOK,
      });

      codepipeline.addStage({
          stageName: "Source",
          actions: [sourceAction],
      });

      //Build Stage
      const buildArtifact = new Artifact();
      const buildAction = new CodeBuildAction({
          actionName: "BuildAction",
          input: sourceArtifact,
          project: this.createCodeBuildProject(artifactsBucket.bucketName),
          outputs: [buildArtifact]
      });

      codepipeline.addStage({
          stageName: "Build",
          actions: [buildAction],
      }
      );

      //Deploy Stage
      const stackName = 'Codepipeline-Lambda-Stack';
      const changeSetName = 'StagedChangeSet'

      const createReplaceChangeSetAction = new CloudFormationCreateReplaceChangeSetAction({
          actionName: "PrepareChanges",
          stackName: stackName,
          changeSetName: changeSetName,
          templatePath: buildArtifact.atPath('outputtemplate.yml'),
          cfnCapabilities: [
              CfnCapabilities.NAMED_IAM,
              CfnCapabilities.AUTO_EXPAND
          ],
          adminPermissions: false,
          runOrder: 1
      });

      const executeChangeSetAction = new CloudFormationExecuteChangeSetAction({
          actionName: "ExecuteChanges",
          changeSetName: changeSetName,
          stackName: stackName,
          runOrder: 2
      })

      codepipeline.addStage({
          stageName: "Deploy",
          actions: [
              createReplaceChangeSetAction,
              executeChangeSetAction
          ],
      }
      );

    //   //Create lambda function
    //   const dailyMenuLambda = new Function(this, "dailyLunchMenu", {
    //     functionName: "DailyMenuNotificationLambda",
    //     runtime: Runtime.PYTHON_3_9,
    //     code: Code.fromBucket(artifactsBucket, "MISC/lambda_function.zip"),
    //     handler: 'lambda_function.lambda_handler',
    //     timeout: Duration.seconds(200),
    //     role: lambdaRole,
    //   });

    //   //Create API Gateway
    //   const api = new RestApi(this, "ApiGateway");

    //   //Create API Gateway resource and method
    //   const lambdaIntegration = new LambdaIntegration(dailyMenuLambda);
    //   api.root.addResource('dailylunchmenu').addMethod('GET', lambdaIntegration);

    //   // Output the API Gateway endpoint URL
    //   new CfnOutput(this, 'ApiGatewayEndpoint', {
    //     value: api.url ?? 'Something went wrong',
    //   })

      //Permission for CloudFormation to access Lambda and other resources
      createReplaceChangeSetAction.deploymentRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'));
      createReplaceChangeSetAction.deploymentRole.attachInlinePolicy(this.getCodePipelineCloudFormationInlinePolicy());
  }

  //Creating code build project
  private createCodeBuildProject = (artifactsBucket: string): PipelineProject => {
      const codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
          projectName: 'Notification-Lambda',
          environment: {
              buildImage: LinuxBuildImage.STANDARD_5_0
          },
          buildSpec: BuildSpec.fromObject(this.getBuildSpecContent(artifactsBucket))
      });

      codeBuildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
      return codeBuildProject;
  }

  //Creating the build spec content.
  private getBuildSpecContent = (artifactsBucket: string) => {
      return {
          version: '0.2',
          phases: {
              install: {
                  'runtime-versions': { python: '3.9' },
                  commands: [
                      'pip install --target=./MISC -r MISC/requirements.txt'
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
                      'export BUCKET=' + artifactsBucket,
                      'sam package --template-file buildspec.yml --s3-bucket $BUCKET --output-template-file outputtemplate.yml',
                      'echo Build completed on `date`'
                  ]
              }
          },
          artifacts: {
              type: 'zip',
              files: [
                  'buildspec.yml',
                  'outputtemplate.yml',
                  'lambda_function.zip'
              ]
          }
      }
  };

  //Inline permission policy for CloudFormation
  private getCodePipelineCloudFormationInlinePolicy = () => {
      return new Policy(this, 'CodePipelineCloudFormationInlinePolicy', {
          statements: [
              new PolicyStatement({
                  effect: Effect.ALLOW,
                  actions: [
                      "apigateway:*",
                      "codedeploy:*",
                      "lambda:*",
                      "cloudformation:CreateChangeSet",
                      "iam:GetRole",
                      "iam:CreateRole",
                      "iam:DeleteRole",
                      "iam:PutRolePolicy",
                      "iam:AttachRolePolicy",
                      "iam:DeleteRolePolicy",
                      "iam:DetachRolePolicy",
                      "iam:PassRole",
                      "s3:GetObject",
                      "s3:GetObjectVersion",
                      "s3:GetBucketVersioning"
                  ],
                  resources: ['*']
              })
          ]
      })
  }

}
