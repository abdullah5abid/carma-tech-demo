import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeArtifactResourcesStack } from './code-artifact-resources';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { DailySchoolFoodNotificationAppDemoStack } from './daily-food-notification-app-stack';


const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;
const region = CARMATECH_CONFIG.Prod.REGION;


export class CarmaTechPipelineStage extends Stage {

    constructor(scope: Construct, id: string, props: StageProps) {
        super(scope, id, props);

        // const service = new CarmaTechInfraStack(this, 'CarmaTechInfraStack', {
        //     env: {
        //         account: account,
        //         region: region,
        //     },
        // });

        /**
            * Deployable unit of the app
        */
        // Add a test ecrRepo, can be deleted in the future.
        const codeArtifactResourceStack = new CodeArtifactResourcesStack(this, 'CodeArtifactResourcesStack');


        // Add school food notification example stack
        const dailySchoolFoodNotificationAppStack = new DailySchoolFoodNotificationAppDemoStack(this, 'DailySchoolFoodNotificationAppStack');


        // Add Carma-tech-api stack here.
    }
}