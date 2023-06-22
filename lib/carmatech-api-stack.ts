import { SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CloudFormationCreateUpdateStackAction, CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
import { CfnParametersCode } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { CARMATECH_CONFIG } from "./configuration";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { BuildSpec, ComputeType, LinuxBuildImage, PipelineProject, Project } from "aws-cdk-lib/aws-codebuild";


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
            repo: 'carma-tech-demo',
            connectionArn: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
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
        const cdkBuildProject = new PipelineProject(this, 'CdkBuildProject', {
            environment: {
                buildImage: LinuxBuildImage.STANDARD_6_0,
                computeType: ComputeType.SMALL,
                privileged: true,
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
                            'npm run cdk synth CarmaTechAPIStack -- -o .',
                        ],
                    },
                },
                artifacts: {
                    files: 'CarmaTechAPIStack.template.json',
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
        // const codeBuildProject = new Project(this, 'CodeBuildProject', {
        //     environment: {
        //         buildImage: LinuxBuildImage.STANDARD_5_0,
        //         computeType: ComputeType.SMALL,
        //         privileged: true, // necessary for Docker builds
        //     },
        //     role: codeBuildRole,
        //     buildSpec: BuildSpec.fromObject({
        //         version: '0.2',
        //         phases: {
        //             install: {
        //                 commands: [
        //                     'npm ci',
        //                 ],
        //             },
        //             build: {
        //                 commands: [
        //                     'npm run build',
        //                 ],
        //             },
        //         },
        //         artifacts: {
        //             files: '**/*',
        //         },
        //     }),
        // });

        // CodeBuild Action
        // const codeBuildAction = new CodeBuildAction({
        //     actionName: 'CodeBuild',
        //     project: cdkBuildProject,
        //     input: appSourceArtifact, // Output artifact from GitHubSourceAction (i.e., carmaAPI repository)
        //     outputs: [new Artifact()],
        // });

        // // Add Build Stage to the Pipeline

        // carmaTechApiCodepipeline.addStage({
        //     stageName: 'Build',
        //     actions: [codeBuildAction],
        // });

        //Generate a lambda layer artifact to deploy lambda
        const appBuildOutput = new Artifact();
        const appBuildAction = new CodeBuildAction({
            actionName: "APP_BUILD",
            input: appSourceArtifact,
            project: cdkBuildProject,
            outputs: [appBuildOutput]
        });


        carmaTechApiCodepipeline.addStage({
            stageName: "Build",
            actions: [
                cdkBuildAction,
                appBuildAction
            ],
        });


        // Deploy stage
        // TODO: Add a deploy stage using appBuildOutput.s3Location
        carmaTechApiCodepipeline.addStage({
            stageName: 'Deploy',
            actions: [
                new CloudFormationCreateUpdateStackAction({
                    actionName: 'App_CFN_Deploy',
                    templatePath: cdkBuildOutput.atPath('CarmaTechAPIStack.template.json'),
                    stackName: 'CarmaTechAPIStack',
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

        // // IAM Role for CodeBuild
        // const codeBuildRole = new Role(this, 'CodeBuildRole', {
        //     assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
        // });

        // codeBuildRole.addToPolicy(
        //     new PolicyStatement({
        //         actions: ['ecr:GetAuthorizationToken', 'ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:GetRepositoryPolicy', 'ecr:DescribeRepositories', 'ecr:ListImages', 'ecr:DescribeImages', 'ecr:BatchGetImage', 'ecr:GetLifecyclePolicy', 'ecr:GetLifecyclePolicyPreview', 'ecr:ListTagsForResource', 'ecr:DescribeImageScanFindings', 'logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage'],
        //         resources: ['*'],
        //     })
        // );

        // // CodeBuild Project
        // const codeBuildProject = new Project(this, 'CodeBuildProject', {
        //     buildSpec: BuildSpec.fromSourceFilename('buildspec.yml'), 
        //     environment: {
        //         buildImage: LinuxBuildImage.STANDARD_5_0,
        //         computeType: ComputeType.SMALL,
        //         privileged: true, // necessary for Docker builds
        //     },
        //     role: codeBuildRole,
        // });

        // // CodeBuild Action
        // const codeBuildAction = new CodeBuildAction({
        //     actionName: 'CodeBuild',
        //     project: codeBuildProject,
        //     input: cdkSourceOutput, // Output artifact from CodeStarConnectionsSourceAction
        //     outputs: [new Artifact()],
        // });

        // // Add Build Stage to the Pipeline

        // carmaTechApiCodepipeline.addStage({
        //     stageName: 'Build',
        //     actions: [codeBuildAction],
        // });
    }


}