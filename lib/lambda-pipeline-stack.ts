import { SecretValue, Stack, StackProps, Stage } from "aws-cdk-lib";
import { Artifact, Pipeline } from "aws-cdk-lib/aws-codepipeline";
import { CloudFormationCreateUpdateStackAction, CodeBuildAction, CodeStarConnectionsSourceAction, GitHubSourceAction, GitHubTrigger } from "aws-cdk-lib/aws-codepipeline-actions";
import { Construct } from "constructs";
import { CARMATECH_CONFIG } from "./configuration";
import { BuildSpec, LinuxBuildImage, PipelineProject } from "aws-cdk-lib/aws-codebuild";

export class DailyFoodNotificationLambdaPipeline extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Artifacts
        const sourceOutput = new Artifact();
        const buildOutput = new Artifact('BuildOutput');

        // Source Action
        const sourceAction = new GitHubSourceAction({
            actionName: 'Lambda_Source',
            owner: 'abdullah5abid',
            repo: 'misc_cdk',
            output: sourceOutput,
            branch: 'master',
            oauthToken: SecretValue.secretsManager('github-token'),
            trigger: GitHubTrigger.WEBHOOK,
        });

        // Build Project
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
                            'pip install -r requirements.txt -t .',
                            'cd ..', // go back to project root
                            'npm install -g aws-cdk', // install CDK
                        ]
                    },
                    build: {
                        commands: [
                            'cd misc_cdk',
                            'npm install', // Install dependencies for the TypeScript CDK app
                            'npm run build', // Build the TypeScript CDK app
                            'cdk synth -o dist', // Synthesize the app into CloudFormation template
                            'cd ..',
                            'cd MISC/', // Change into the directory containing the Python lambda function
                            'zip -r ../misc_cdk/dist/lambda_function.zip .',
                        ]
                    }
                },
                artifacts: {
                    files: [
                        'misc_cdk/dist/**/*'
                    ]
                },
                cache: {
                    paths: ['misc_cdk/node_modules/**/*']
                }
            }),
            environment: {
                buildImage: LinuxBuildImage.STANDARD_5_0,
                privileged: true,
            },
        });

        // Build Action
        const buildAction = new CodeBuildAction({
            actionName: 'Lambda_Build',
            project: buildProject,
            input: sourceOutput,
            outputs: [buildOutput],
        });

        // Deploy Action
        const deployAction = new CloudFormationCreateUpdateStackAction({
            actionName: 'Lambda_Deploy',
            templatePath: buildOutput.atPath('misc_cdk/dist/MiscCdkStack.template.json'),
            stackName: 'CarmaTechLambdaStack',
            adminPermissions: true,
        });

        // Pipeline
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
