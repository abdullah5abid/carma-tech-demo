import { Construct } from 'constructs';
import { Stack, StackProps } from 'aws-cdk-lib';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, CodeStarConnectionsSourceAction, CloudFormationCreateReplaceChangeSetAction, CloudFormationExecuteChangeSetAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { Role, ServicePrincipal, ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { Project, BuildSpec, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { CfnParameter, CfnStack, RemovalPolicy } from 'aws-cdk-lib';
import { CARMATECH_CONFIG } from './configuration';


export class DailyFoodNotificationLambdaPipeline extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // IAM role for the pipeline
    const pipelineRole = new Role(this, 'PipelineRole', {
      assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
      ],
    });

    // S3 Bucket where CodeBuild will place our built lambda function
    const bucket = new Bucket(this, 'MyBucket', {
      bucketName: 'carmatech-lambda-builds',  // Change the bucket name accordingly
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // AWS CodeBuild project
    const buildProject = new PipelineProject(this, 'MyProject', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
      },
      buildSpec: BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: [
              'echo Installing dependencies...',
              'cd MISC/',
              'pip install -r requirements.txt -t /asset-output',
            ],
          },
          build: {
            commands: [
              'echo Building application...',
              'cp -r . /asset-output',
            ],
          },
        },
        artifacts: {
          'base-directory': '/asset-output',
          files: [
            '**/*', // This line makes the output include all files. Adjust this as necessary.
          ],
        },
      }),
    });

    // AWS CodePipeline pipeline
    const pipeline = new Pipeline(this, 'Pipeline', {
      role: pipelineRole,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new CodeStarConnectionsSourceAction({
              actionName: 'Checkout',
              output: new Artifact('Source'),
              connectionArn: CARMATECH_CONFIG.Prod.ARN, // Connection ARN
              owner: 'abdullah5abid',
              repo: 'misc_cdk',
              branch: 'master', // Branch name
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new CodeBuildAction({
              actionName: 'Lambda_Build',
              project: buildProject, // using the build project with the buildSpec
              input: new Artifact('Source'),
              outputs: [new Artifact('Lambda')],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            // Assuming you are deploying the function using CloudFormation
            new CloudFormationCreateReplaceChangeSetAction({
              actionName: 'CreateChangeSet',
              stackName: 'LambdaStack', // Stack name
              changeSetName: 'LambdaChangeSet', // Change set name
              templatePath: new Artifact('Lambda').atPath('template.yml'), // Path to the CloudFormation template
              adminPermissions: true,
              runOrder: 1,
            }),
            new CloudFormationExecuteChangeSetAction({
              actionName: 'Deploy',
              stackName: 'LambdaStack', // Stack name
              changeSetName: 'LambdaChangeSet', // Change set name
              runOrder: 2,
            }),
          ],
        },
      ],
    });
  }
}
