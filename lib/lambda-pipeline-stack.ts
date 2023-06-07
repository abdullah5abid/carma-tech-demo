import { Stack, StackProps, Stage } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CloudFormationCreateUpdateStackAction, CodeBuildAction, CodeStarConnectionsSourceAction } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { CARMATECH_CONFIG } from "./configuration";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";

export class DailyFoodNotificationLambdaPipeline extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
      super(scope, id, props);

      // Artifact for the source output
      const sourceOutput = new Artifact();

      // The source action represents the retrieval of the lambda code from the Carma-tech/internal repo
      const sourceAction = new CodeStarConnectionsSourceAction({
          actionName: 'Lambda_Source',
          connectionArn: CARMATECH_CONFIG.Prod.ARN,
          owner: 'abdullah5abid',
          repo: 'misc_cdk',
          output: sourceOutput,
          branch: 'master', 
      });

      // CodeBuild project
      const buildProject = new PipelineProject(this, 'LambdaBuild', {
          buildSpec: BuildSpec.fromObject({
              version: '0.2',
              phases: {
                  install: {
                      'runtime-versions': {
                          python: 3.9
                      },
                      commands: [
                          'cd MISC/',
                          'pip install -r requirements.txt -t .'
                      ]
                  },
                  build: {
                      commands: [
                          'zip -r lambda_function.zip .'
                      ]
                  }
              },
              artifacts: {
                  files: [
                      'lambda_function.zip'
                  ]
              }
          }),
          environment: {
              buildImage: LinuxBuildImage.STANDARD_5_0,
          },
      });

      // Build stage
      const buildAction = new CodeBuildAction({
          actionName: 'Lambda_Build',
          project: buildProject,
          input: sourceOutput,
          outputs: [new Artifact('BuildOutput')],
      });

      const buildOutput = new Artifact('BuildOutput');
      // Define the action that deploys the CloudFormation template
      const deployAction = new CloudFormationCreateUpdateStackAction({
          actionName: 'Lambda_Deploy',
          templatePath: buildOutput.atPath('template.json'),
          stackName: 'CarmaTechLambdaStack',
          adminPermissions: true,
      });


      // Deploy stage
      const deployStage = new Stage(this, 'Deploy');

      // Create pipeline
      const pipeline = new Pipeline(this, 'DailyFoodNotificationLambdaPipeline', {
          pipelineName: 'DailyFoodNotificationLambdaPipeline',
          stages: [
              {
                  stageName: 'Source',
                  actions: [sourceAction],
              },
              {
                  stageName: 'Build',
                  actions: [buildAction],
              },
              {
                  stageName: 'Deploy',
                  actions: [deployAction], 
              },
          ],
      });
  }
}