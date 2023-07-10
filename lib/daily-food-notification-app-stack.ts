import { CfnOutput, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Alias, DockerImageCode, DockerImageFunction, IFunction } from 'aws-cdk-lib/aws-lambda';
import { join } from "path";
import { LambdaDeploymentConfig, LambdaDeploymentGroup } from "aws-cdk-lib/aws-codedeploy";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { JsonSchemaType, JsonSchemaVersion, LambdaIntegration, Model, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Repository } from "aws-cdk-lib/aws-ecr";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import { DockerImageName, ECRDeployment } from "cdk-ecr-deployment";
import { ManagedPolicy } from "aws-cdk-lib/aws-iam";

import { CARMATECH_CONFIG } from "./configuration";


/* App stack, A.k.a: lambda stack */
export class DailySchoolFoodNotificationAppDemoStack extends Stack {
  public readonly function: IFunction;
  private ecrRepository: Repository;
  private dockerImageAsset: DockerImageAsset;
  private ecrDeployment: ECRDeployment;
  private codeBuildProject: PipelineProject;
  private dockerImageAssetPath: string = join(__dirname, './dockerimage');

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const currentDate = new Date().toISOString();

    // Create the repository
    this.ecrRepository = new Repository(this, 'DailySchoolFoodNotificationImageRepository', {
      repositoryName: 'dailyschoolfoodnotification-lambda-assets-repo',
      lifecycleRules: [{
        description: "Keeps a maximum number of images to minimize storage",
        maxImageCount: 10
      }]
    });

    // creates the lambda function
    this.function = new DockerImageFunction(this, 'DailySchoolFoodNotificationLambda', {
      code: DockerImageCode.fromImageAsset(this.dockerImageAssetPath),
      description: `DailySchoolFoodNotification lambda function generated on: ${currentDate}`
    });

    // create this lambda's CICD codepipeline
    this.createLambdaPipeLine();

    // Create EventBridge Role to schedule the lambda function
    new Rule(this, 'DailySchoolFoodNotificationLambdaSchedule', {
      schedule: Schedule.cron({
        year: '*',
        month: '*',
        day: '*',
        hour: '3',
        minute: '0',
      }), // 10:00 PM CDT is 3:00 AM UTC
      targets: [new LambdaFunction(this.function)], // targeting the Lambda alias
    });

    // Create a new RestApi
    const api = new RestApi(this, 'DailySchoolFoodNotificationApi', {
      restApiName: 'Daily School Food notification Service',
      description: 'This service serves daily school food notifications.',
    });

    // Create a new LambdaIntegration
    const getIntegration = new LambdaIntegration(this.function, {
      requestTemplates: { "application/json": '{ "statusCode": "200" }' },
    });

    // Add an API Gateway resource and method
    api.root.addMethod('GET', getIntegration, {
      requestParameters: {
        'method.request.querystring.date': false,
        'method.request.querystring.url': false,
      },
    });

    // Output API Url
    new CfnOutput(this, 'ApiUrl', {
      value: api.url ?? "Something went wrong"
    })


    // deployment group
    // useful for devOps, e.g: canary deploy
    // reference: https://dev.to/ryands17/canary-deployment-of-lambdas-using-cdk-pipelines-1l0b
    // new LambdaDeploymentGroup(this, 'DeploymentGroup', {
    //   alias: lambdaAlias,
    //   deploymentConfig: LambdaDeploymentConfig.LINEAR_10PERCENT_EVERY_1MINUTE,
    // });

  }

  createLambdaPipeLine() {
    const dailySchoolFoodNotificationCodepipeline = new Pipeline(this, 'Pipeline', {
      pipelineName: 'dailySchoolFoodNotificationProdCodePipeline',
    });

    //1. Source Stage
    const appSourceArtifact = new Artifact();
    // const appSourceAction = new CodeStarConnectionsSourceAction({
    //   actionName: 'Get_App_Source',
    //   // owner: 'Carma-tech',
    //   // repo: 'internal',
    //   owner: 'abdullah5abid',
    //   repo: 'misc_cdk',
    //   // connectionArn: 'arn:aws:codestar-connections:us-east-2:100209637061:connection/6ff57946-c976-49f5-81d2-857e829e67c5',
    //   connectionArn: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
    //   output: appSourceArtifact,
    //   branch: 'master',
    // });
    const appSourceAction = new GitHubSourceAction({
      actionName: 'Get_App_Source',
      owner: 'abdullah5abid',
      repo: 'misc_cdk',
      output: appSourceArtifact,
      branch: 'master',
      oauthToken: SecretValue.secretsManager('github-token'),
      trigger: GitHubTrigger.WEBHOOK,
    })

    dailySchoolFoodNotificationCodepipeline.addStage({
      stageName: "Source",
      actions: [appSourceAction],
    });


    // 2. Build And Deploy Stage
    const appBuildAndDeployAction = new CodeBuildAction({
      actionName: "APP_BUILD",
      input: appSourceArtifact,
      project: this.createCodeBuildProject(),
    });

    dailySchoolFoodNotificationCodepipeline.addStage({
      stageName: "Build-Lambda-Image-And-Deploy",
      actions: [appBuildAndDeployAction]
    });

    // Assign necessary permissions to CodeBuild project
    this.codeBuildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryFullAccess'));
    this.codeBuildProject.role?.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_FullAccess'));
  }

  private createCodeBuildProject = (): PipelineProject => {
    this.codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
      projectName: 'DailyMenuNotification-Lambda-Image-Build',
      environment: {
        privileged: true,
        buildImage: LinuxBuildImage.STANDARD_5_0
      },
      buildSpec: BuildSpec.fromObject(this.getBuildSpecContent()),
      environmentVariables: {
        'REPOSITORY_URI': { value: this.ecrRepository.repositoryUri },
        'LAMBDA_FUNCTION_NAME': { value: this.function.functionName },
        'AWS_ACCOUNT_ID': { value: CARMATECH_CONFIG.Prod.ACCOUNT_ID }
      }
    });

    return this.codeBuildProject;
  }

  createDockerImageAsset() {
    this.dockerImageAsset = new DockerImageAsset(this, 'DockerImageAsset', {
      directory: join(__dirname, './dockerimage'),
      buildArgs: {},
      invalidation: {
        buildArgs: false,
      },
    });
  }

  createEcrDeployment() {
    this.ecrDeployment = new ECRDeployment(this, 'EcrDeployment', {
      src: new DockerImageName(this.dockerImageAsset.imageUri),
      dest: new DockerImageName(`${this.ecrRepository.repositoryUri}:latest`),
    });
  }

  //Creating the build spec content.
  private getBuildSpecContent = () => {
    return {
      version: '0.2',
      phases: {
        pre_build: {
          commands: [
            'echo Logging in to Amazon ECR...',
            'aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com',
            'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
            'IMAGE_TAG=${COMMIT_HASH:=latest}',
          ]
        },
        build: {
          commands: [
            'echo `ls -lrt`',
            'echo Build started on `date`',
            'echo Building the Docker image...',
            'docker build -t $REPOSITORY_URI:$IMAGE_TAG ./lambda_daily_school_food_notification'
          ]
        },
        post_build: {
          commands: [
            'bash -c "if [ /"$CODEBUILD_BUILD_SUCCEEDING/" == /"0/" ]; then exit 1; fi"',
            'echo Build completed on `date`',
            'echo Pushing the Docker image...',
            'docker push $REPOSITORY_URI:$IMAGE_TAG',
            'aws lambda update-function-code --function-name $LAMBDA_FUNCTION_NAME --image-uri $REPOSITORY_URI:$IMAGE_TAG'
          ]
        }
      }
    }
  };

}
