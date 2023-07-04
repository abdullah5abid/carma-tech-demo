import { CloudFormationCreateUpdateStackAction } from 'aws-cdk-lib/aws-codepipeline-actions';
import { CfnOutput, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { BuildSpec, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';
import { Artifact, Pipeline } from 'aws-cdk-lib/aws-codepipeline';
import { CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { InstanceClass, InstanceSize, InstanceType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { DockerImageCode, DockerImageFunction, IFunction, Function, Code, Runtime, CfnParametersCode } from 'aws-cdk-lib/aws-lambda';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion } from 'aws-cdk-lib/aws-rds';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { DockerImageName, ECRDeployment } from 'cdk-ecr-deployment';
import { Construct } from 'constructs';
import { join } from 'path';
import { CARMATECH_CONFIG } from './configuration';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';



/**
 * This stack contains infrastructure used by the Lambda function from {@link DailySchoolFoodNotificationAppStack}.
 * For this example, it's only an SNS Topic,
 * but could be other things as well.
 * Reference: https://github.com/skinny85/cdk-codepipeline-and-local-lambda-guidance
 */
export class CarmaTechInfraStack extends Stack {
  public readonly function: IFunction;
  public readonly lambdaCode: CfnParametersCode;
  private ecrRepository: Repository;
  private dockerImageAsset: DockerImageAsset;
  private ecrDeployment: ECRDeployment;
  private codeBuildProject: PipelineProject;
  private dockerImageAssetPath: string = join(__dirname, './dockerimage');

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // vpc
    const vpc = new Vpc(this, 'CarmaTechVpc', {
      maxAzs: 2,
    })

    // RDS
    const rdsInstance = new DatabaseInstance(this, 'RDS', {
      engine: DatabaseInstanceEngine.mysql({
        version: MysqlEngineVersion.VER_8_0_28,
      }),
      credentials: Credentials.fromGeneratedSecret('clusteradmin'),
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      vpc,
    });

    const snsTopic = new sns.Topic(this, 'CarmaTechSNSTopic', {
      displayName: 'CarmaTech SNS Topic'
    });

    // snsTopic.addSubscription(new sns_subs.LambdaSubscription(this.function));

    // Add a Lambda subscription to the topic
    // snsTopic.grantPublish(this.function);

    // const currentDate = new Date().toISOString();

    this.ecrRepository = new Repository(this, 'EcrRepository', {
      repositoryName: 'carmatech-infra-ecr-repo',
      lifecycleRules: [{
        description: "Keeps a maximum number of images to minimize storage",
        maxImageCount: 10
      }]
    });

    const carmaTechInfraCodepipeline = new Pipeline(this, 'Pipeline', {
      pipelineName: 'carmaTechInfraProdCodepipeline',
    });

    //1. Source Stage
    // Infra source
    const cdkSourceOutput = new Artifact();
    const cdkSourceAction = new CodeStarConnectionsSourceAction({
      actionName: 'Get_Cdk_Source',
      owner: "abdullah5abid",
      repo: "carma-tech-demo",
      connectionArn: CARMATECH_CONFIG.Prod.ARN,
      output: cdkSourceOutput,
      branch: 'master',
    });

    // App source
    const appSourceArtifact = new Artifact();
    const appSourceAction = new GitHubSourceAction({
      actionName: 'Get_App_Source',
      owner: 'abdullah5abid',
      repo: 'carmaAPI',
      output: appSourceArtifact,
      branch: 'main',
      oauthToken: SecretValue.secretsManager('github-token'),
      trigger: GitHubTrigger.WEBHOOK,
    });

    carmaTechInfraCodepipeline.addStage({
      stageName: 'Source',
      actions: [cdkSourceAction, appSourceAction]
    });

    // 2. Build Stage
    const cdkBuildProject = new PipelineProject(this, 'CdkBuildProject', {
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
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
              'npm run cdk synth CarmaTechInfraStack -- -o .',
            ],
          },
        },
        artifacts: {
          files: 'CarmaTechInfraStack.template.json',
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

    // Generate a lambda layer artifact to deploy lambda
    const appBuildOutput = new Artifact();
    const appBuildAction = new CodeBuildAction({
      actionName: 'APP_BUILD',
      input: appSourceArtifact,
      project: this.createCodeBuildProject(),
      outputs: [appBuildOutput],
    });

    carmaTechInfraCodepipeline.addStage({
      stageName: 'Build',
      actions: [cdkBuildAction, appBuildAction]
    });

    // Deploy Stage
    carmaTechInfraCodepipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new CloudFormationCreateUpdateStackAction({
          actionName: 'App_CFN_Deploy',
          templatePath: cdkBuildOutput.atPath('CarmaTechInfraStack.template.json'),
          stackName: 'CarmaTechInfraAppStack',
          adminPermissions: true,
          // parameterOverrides: {
          //   ...this.lambdaCode.assign(appBuildOutput.s3Location)
          // },
          extraInputs: [appBuildOutput],
        }),
      ],
    });

  }

  // create code build project
  private createCodeBuildProject = (): PipelineProject => {
    const codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
      projectName: 'CarmaTechInfra-Lambda',
      environment: {
        buildImage: LinuxBuildImage.STANDARD_5_0,
        privileged: true,
      },
      buildSpec: BuildSpec.fromObject(this.getBuildSpecContent()),
      environmentVariables: {
        'REPOSITORY_URI': { value: this.ecrRepository.repositoryUri },
        'AWS_ACCOUNT_ID': { value: CARMATECH_CONFIG.Prod.ACCOUNT_ID }
      }
    });

    // Give the CodeBuild project permissions to interact with the ECR repository
    this.ecrRepository.grantPullPush(codeBuildProject.grantPrincipal);

    return codeBuildProject;
  };

  // create the build spec content
  private getBuildSpecContent = () => {
    return {
      version: '0.2',
      phases: {
        install: {
          'runtime-versions': { docker: '19' },
          commands: []
        },
        pre_build: {
          commands: [
            // '$(aws ecr get-login --region $AWS_DEFAULT_REGION --no-include-email)',
            // 'REPOSITORY_URI={ECR repo URI}',
            // 'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            // 'IMAGE_TAG=${COMMIT_HASH:=latest}'
            'echo Logging in to Amazon ECR...',
            'aws --version',
            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            'IMAGE_TAG=${COMMIT_HASH:=latest}',
          ]
        },
        build: {
          commands: [
            // 'docker build -t $REPOSITORY_URI:latest -f Dockerfile ./src',
            // 'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG',
            'echo Build started on `date`',
            'echo Building the Docker image...',
            'docker build -t $REPOSITORY_URI:latest -f Dockerfile ./src',
            'docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG',
            'echo Build completed on `date`',
          ]
        },
        post_build: {
          commands: [
            // 'docker push $REPOSITORY_URI:latest',
            // 'docker push $REPOSITORY_URI:$IMAGE_TAG'
            'echo Pushing the Docker images...',
            'docker push $REPOSITORY_URI:latest',
            'docker push $REPOSITORY_URI:$IMAGE_TAG',
            "printf '[{\"name\":\"nestjs-graphql\",\"imageUri\":\"%s\"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json",
          ]
        },
      },
      artifacts: {
        'base-directory': 'src',
        files: [
          '**/*'
        ],
      }
    }
  };

}
