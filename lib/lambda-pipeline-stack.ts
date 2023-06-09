import { CfnCapabilities, SecretValue, Stack, StackProps, Stage } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CloudFormationCreateReplaceChangeSetAction, CloudFormationCreateUpdateStackAction, CloudFormationExecuteChangeSetAction, CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { CARMATECH_CONFIG } from "./configuration";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Effect, ManagedPolicy, Policy, PolicyStatement } from "aws-cdk-lib/aws-iam";

// export class DailyFoodNotificationLambdaPipeline extends Stack {
//     constructor(scope: Construct, id: string, props?: StackProps) {
//         super(scope, id, props);

//         // Artifacts
//         const sourceOutput = new Artifact();
//         const buildOutput = new Artifact('BuildOutput');

//         // Source Action
//         const sourceAction = new GitHubSourceAction({
//             actionName: 'Lambda_Source',
//             owner: 'abdullah5abid',
//             repo: 'misc_cdk',
//             output: sourceOutput,
//             branch: 'master',
//             oauthToken: SecretValue.secretsManager('github-token'),
//             trigger: GitHubTrigger.WEBHOOK,
//         });

//         // Build Project
//         const buildProject = new PipelineProject(this, 'LambdaBuild', {
//             buildSpec: BuildSpec.fromObject({
//                 version: '0.2',
//                 phases: {
//                     install: {
//                         'runtime-versions': {
//                             python: 3.9
//                         },
//                         commands: [
//                             'ls -la', 
//                             'pip install -r requirements.txt -t .',
//                             // 'cd ..', // go back to project root
//                             'npm install -g aws-cdk', // install CDK
//                         ]
//                     },
//                     build: {
//                         commands: [
//                             'cd misc_cdk',
//                             'npm install', // Install dependencies for the TypeScript CDK app
//                             'npm run build', // Build the TypeScript CDK app
//                             'cdk synth -o dist', // Synthesize the app into CloudFormation template
//                             'cd ..',
//                             'cd MISC/', // Change into the directory containing the Python lambda function
//                             'zip -r ../misc_cdk/dist/lambda_function.zip .',
//                         ]
//                     }
//                 },
//                 artifacts: {
//                     files: [
//                         'misc_cdk/dist/**/*'
//                     ]
//                 },
//                 cache: {
//                     paths: ['misc_cdk/node_modules/**/*']
//                 }
//             }),
//             environment: {
//                 buildImage: LinuxBuildImage.STANDARD_5_0,
//                 privileged: true,
//             },
//         });


//         // Build Action
//         const buildAction = new CodeBuildAction({
//             actionName: 'Lambda_Build',
//             project: buildProject,
//             input: sourceOutput,
//             outputs: [buildOutput],
//         });

//         // Deploy Action
//         const deployAction = new CloudFormationCreateUpdateStackAction({
//             actionName: 'Lambda_Deploy',
//             templatePath: buildOutput.atPath('misc_cdk/dist/MiscCdkStack.template.json'),
//             stackName: 'CarmaTechLambdaStack',
//             adminPermissions: true,
//         });

//         // Pipeline
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
//                     actions: [deployAction],
//                 },
//             ],
//         });
//     }
// }


export class CdkCodepipelineLambdaStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);


        //Creating s3 Bucket
        const artifactsBucket = new Bucket(this, "S3BucketForPipelineArtifacts");

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

        //Permission for CloudFormation to access Lambda and other resources
        createReplaceChangeSetAction.deploymentRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaExecute'));
        createReplaceChangeSetAction.deploymentRole.attachInlinePolicy(this.getCodePipelineCloudFormationInlinePolicy());
    }

    //Creating code build project
    private createCodeBuildProject = (artifactsBucket: string): PipelineProject => {
        const codeBuildProject = new PipelineProject(this, 'CodeBuildProject', {
            projectName: 'CodeBuild-Lambda',
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
                        'pip install -r MISC/requirements.txt'
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
                    'outputtemplate.yml'
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