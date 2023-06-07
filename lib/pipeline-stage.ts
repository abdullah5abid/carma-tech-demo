import { CfnOutput, Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CarmaTechInfraStack } from '@lib/carma-tech-infra-stack';
import { CARMATECH_CONFIG } from '@lib/configuration';


const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;
const region = CARMATECH_CONFIG.Prod.REGION;

/**
 * Deployable unit of the app
 */
export class CarmaTechPipelineStage extends Stage {
    public readonly urlOutput: CfnOutput;

    constructor(scope: Construct, id: string, props: StageProps) {
        super(scope, id, props);

        const service = new CarmaTechInfraStack(this, 'CarmaTechInfraStack', {
            env: {
                account: account,
                region: region,
            },
        }); 

        // Expose NewBmoStack's output one level higher
        // TODO
        // this.urlOutput = service.urlOutput;
    }
}
