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
                    'abdullah5abid/misc_cdk',
                    'master',
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
