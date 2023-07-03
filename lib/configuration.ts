export const CARMATECH_CONFIG = {
    Prod: {
        SECRET_ARN: 'arn:aws:secretsmanager:ap-northeast-1:395929101814:secret:github-token-SsHTpI',
        ARN: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
        // ARN: 'arn:aws:codestar-connections:eu-north-1:395929101814:connection/487e7a54-9015-4306-90d3-e586367b9412',
        ACCOUNT_ID: '395929101814',
        REGION: 'us-east-2',
    }
}


// import { CfnCapabilities, Duration, RemovalPolicy, SecretValue, Stack, StackProps, Stage } from "aws-cdk-lib";
// import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
// import { CloudFormationCreateReplaceChangeSetAction, CloudFormationCreateUpdateStackAction, CloudFormationExecuteChangeSetAction, CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
// import { Construct } from "constructs";
// import { CARMATECH_CONFIG } from "./configuration";
// import { BuildEnvironmentVariableType, BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";
// import { Bucket } from "aws-cdk-lib/aws-s3";
// import { Effect, ManagedPolicy, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";
// import { Function, Code, Runtime } from "aws-cdk-lib/aws-lambda";


// export class DailyFoodNotificationLambdaPipeline extends Stack {
//   constructor(scope: Construct, id: string, props: StackProps) {
//       super(scope, id, props);

//       // Creates an S3 bucket
//     const bucket = new Bucket(this, 'MyBucket', {
//         bucketName: 'daily-menu-items-bucket',
//         removalPolicy: RemovalPolicy.DESTROY
//       });

//       const myLambda = new Function(this, 'MyLambdaHandler', {
//         code: Code.fromAsset('./misc_cdk/', {
//             bundling: {
//                 image: Runtime.PYTHON_3_9.bundlingImage,
//                 command: [
//                     'bash', '-c',
//                     'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
//                 ],
//             },
//         }),
//         runtime: Runtime.PYTHON_3_9,
//         handler:'lambda_function.lambda_handler', // Exported handler name
//         timeout: Duration.seconds(300),
//         environment: {
//             BUCKET_NAME: bucket.bucketName,
//         }
//       });

//     //   bucket.grantReadWrite(myLambda);
        

//       //Creating s3 Bucket
//       const artifactsBucket = new Bucket(this, "S3BucketForPipelineArtifacts");

//       //Codepipeline
//       const codepipeline = new Pipeline(this, 'CodePipelineForLambdaDeployment', {});

//       //Source Stage
//       const sourceArtifact = new Artifact();

//       const sourceAction = new GitHubSourceAction({
//         actionName: 'Lambda_Source',
//         owner: 'abdullah5abid',
//         repo: 'misc_cdk',
//         output: sourceArtifact,
//         branch: 'master', //change to your branch name
//         oauthToken: SecretValue.secretsManager('github-token'),
//         trigger: GitHubTrigger.WEBHOOK,
//       });

//       codepipeline.addStage({
//           stageName: "Source",
//           actions: [sourceAction],
//       });

//       //Build Stage
//       const buildArtifact = new Artifact();
//       const buildAction = new CodeBuildAction({
//           actionName: "BuildAction",
//           input: sourceArtifact,
//           project: this.createCodeBuildProject(artifactsBucket.bucketName),
//           outputs: [buildArtifact]
//       });

//       codepipeline.addStage({
//           stageName: "Build",
//           actions: [buildAction],
//       }
//       );

//       //Deploy Stage
//       const stackName = 'Codepipeline-Lambda-Stack';
//       const changeSetName = 'StagedChangeSet'

//       const createReplaceChangeSetAction = new CloudFormationCreateReplaceChangeSetAction({
//           actionName: "PrepareChanges",
//           stackName: stackName,
//           changeSetName: changeSetName,
//           templatePath: buildArtifact.atPath('outputtemplate.yml'),
//           cfnCapabilities: [
//               CfnCapabilities.NAMED_IAM,
//               CfnCapabilities.AUTO_EXPAND
//           ],
//           adminPermissions: false,
//           runOrder: 1
//       });

//       const executeChangeSetAction = new CloudFormationExecuteChangeSetAction({
//           actionName: "ExecuteChanges",
//           changeSetName: changeSetName,
//           stackName: stackName,
//           runOrder: 2
//       })

//       codepipeline.addStage({
//           stageName: "Deploy",
//           actions: [
//               createReplaceChangeSetAction,
//               executeChangeSetAction
//           ],
//       }
//       );

//       //Permission for CloudFormation to access Lambda and other resources
//       createReplaceChangeSetAction.deploymentRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'));
//       createReplaceChangeSetAction.deploymentRole.attachInlinePolicy(this.getCodePipelineCloudFormationInlinePolicy());
//   }

//   //Creating code build project
//   private createCodeBuildProject = (artifactsBucket: string): PipelineProject => {
//       const codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
//           projectName: 'Notification-Lambda',
//           environment: {
//               buildImage: LinuxBuildImage.STANDARD_5_0
//           },
//           buildSpec: BuildSpec.fromObject(this.getBuildSpecContent(artifactsBucket))
//       });

//       codeBuildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));
//       return codeBuildProject;
//   }

//   //Creating the build spec content.
//   private getBuildSpecContent = (artifactsBucket: string) => {
//       return {
//           version: '0.2',
//           phases: {
//               install: {
//                   'runtime-versions': { python: '3.9' },
//                   commands: [
//                       'pip install --target=./MISC -r MISC/requirements.txt'
//                   ]
//               },
//               pre_build: {
//                   commands: [
//                       'echo Pre-build completed'
//                   ]
//               },
//               build: {
//                   commands: [
//                       'echo Build started on `date`',
//                       'export BUCKET=' + artifactsBucket,
//                       'sam package --template-file buildspec.yml --s3-bucket $BUCKET --output-template-file outputtemplate.yml',
//                       'echo Build completed on `date`'
//                   ]
//               }
//           },
//           artifacts: {
//               type: 'zip',
//               files: [
//                   'buildspec.yml',
//                   'outputtemplate.yml'
//               ]
//           }
//       }
//   };

//   //Inline permission policy for CloudFormation
//   private getCodePipelineCloudFormationInlinePolicy = () => {
//       return new Policy(this, 'CodePipelineCloudFormationInlinePolicy', {
//           statements: [
//               new PolicyStatement({
//                   effect: Effect.ALLOW,
//                   actions: [
//                       "apigateway:*",
//                       "codedeploy:*",
//                       "lambda:*",
//                       "cloudformation:CreateChangeSet",
//                       "iam:GetRole",
//                       "iam:CreateRole",
//                       "iam:DeleteRole",
//                       "iam:PutRolePolicy",
//                       "iam:AttachRolePolicy",
//                       "iam:DeleteRolePolicy",
//                       "iam:DetachRolePolicy",
//                       "iam:PassRole",
//                       "s3:*",
//                     //   "s3:GetObjectVersion",
//                     //   "s3:GetBucketVersioning",
//                     //   "s3:PutObject",
//                     //   "s3:PutObjectVersion",
//                     //   "s3:DeleteObject",
//                     //   "s3:DeleteObjectVersion",
//                     //   "s3:ListBuckets",
//                   ],
//                   resources: ['*']
//               })
//           ]
//       })
//   }

// }