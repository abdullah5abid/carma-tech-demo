import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
import { CfnParametersCode } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { CARMATECH_CONFIG } from "./configuration";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BuildSpec, ComputeType, LinuxBuildImage, Project } from "aws-cdk-lib/aws-codebuild";


export interface CarmaTechAPIStackProps extends StackProps {
    readonly lambdaCode: CfnParametersCode
}

export class CarmaTechAPIStack extends Stack {
    constructor(scope: Construct, id: string, props: CarmaTechAPIStackProps) {
        super(scope, id, props);

        const carmaTechApiCodepipeline = new Pipeline(this, 'Pipeline', {
            pipelineName: 'carmaTechApiProdCodePipeline',
        });

        // 1. Source Stage
        // 1.1 Infra Api Source
        const cdkSourceOutput = new Artifact();
        const cdkSourceAction = new CodeStarConnectionsSourceAction({
            actionName: 'Get_Cdk_Source',
            owner: 'abdullah5abid',
            repo: 'Carma-tech-demo',
            connectionArn: CARMATECH_CONFIG.Prod.ARN,
            output: cdkSourceOutput,
            branch: 'rds',
        });

        // 1.2 App Source
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

        carmaTechApiCodepipeline.addStage({
            stageName: "Source",
            actions: [cdkSourceAction, appSourceAction]
        });

        // 2 Build Stage
        // 2.1 synthesize the lambda CDK template, using CodeBuild


        // IAM Role for CodeBuild
        const codeBuildRole = new Role(this, 'CodeBuildRole', {
            assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
        });

        codeBuildRole.addToPolicy(
            new PolicyStatement({
                actions: ['ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:GetRepositoryPolicy', 'ecr:DescribeRepositories', 'ecr:ListImages', 'ecr:DescribeImages', 'ecr:BatchGetImage', 'ecr:GetLifecyclePolicy', 'ecr:GetLifecyclePolicyPreview', 'ecr:ListTagsForResource', 'ecr:DescribeImageScanFindings', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage'],
                resources: ['*'],
            })
        );

        // CodeBuild Project
        const codeBuildProject = new Project(this, 'CodeBuildProject', {
            buildSpec: BuildSpec.fromSourceFilename('buildspec.yml'), 
            environment: {
                buildImage: LinuxBuildImage.STANDARD_5_0,
                computeType: ComputeType.SMALL,
                privileged: true, // necessary for Docker builds
            },
            role: codeBuildRole,
        });

        // CodeBuild Action
        const codeBuildAction = new CodeBuildAction({
            actionName: 'CodeBuild',
            project: codeBuildProject,
            input: cdkSourceOutput, // Output artifact from CodeStarConnectionsSourceAction
            outputs: [new Artifact()],
        });

        // Add Build Stage to the Pipeline
        carmaTechApiCodepipeline.addStage({
            stageName: 'Build',
            actions: [codeBuildAction],
        });
    }
}