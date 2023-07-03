import { Stack, StackProps} from 'aws-cdk-lib';
import { Construct} from 'constructs';
import {
    CodePipeline,
    ShellStep,
    CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { CarmaTechPipelineStage } from './pipeline-stage';



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
                    'abdullah5abid/carma-tech-demo',
                    'main',
                    {
                        connectionArn: CARMATECH_CONFIG.Prod.ARN,
                    }
                ),
                installCommands: [
                    'npm i -g npm@latest',
                    'npm install -g aws-cdk@2'
                ],
                commands: [
                    'npm ci',
                    'npm run build',
                    'npx cdk synth'
                ]
            })
        });

        const cdkInfraDeployStage = new CarmaTechPipelineStage(this, 'CDKInfraDeployStage', {
            env: {
                account: CARMATECH_CONFIG.Prod.ACCOUNT_ID,
                region: CARMATECH_CONFIG.Prod.REGION,
            },
        })
        pipeline.addStage(cdkInfraDeployStage);

    }
}