export const CARMATECH_CONFIG = {
    Prod: {
        SECRET_ARN: 'arn:aws:secretsmanager:ap-northeast-1:395929101814:secret:github-token-SsHTpI',
        ARN: 'arn:aws:codestar-connections:us-east-2:395929101814:connection/e50edeaf-fa53-40c7-983c-f96d86414901',
        // ARN: 'arn:aws:codestar-connections:eu-north-1:395929101814:connection/487e7a54-9015-4306-90d3-e586367b9412',
        ACCOUNT_ID: '395929101814',
        REGION: 'us-east-2',
    }
}

// const cdkSourceOutput = new Artifact();
//     const cdkSourceAction = new CodeStarConnectionsSourceAction({
//       actionName: 'Get_Cdk_Source',
//       owner: 'Carma-tech',
//       repo: 'Carma-tech-infra',
//       connectionArn: 'arn:aws:codestar-connections:us-east-2:100209637061:connection/646b3d0d-3a3f-4fbb-a045-16c33ee7e027',
//       output: cdkSourceOutput,
//       branch: 'main',
//     });

//     // App source
//     const appSourceArtifact = new Artifact();
    // const appSourceAction = new CodeStarConnectionsSourceAction({
    //   actionName: 'Get_App_Source',
    //   owner: 'Carma-tech',
    //   repo: 'CarmaTech-API',
    //   connectionArn: 'arn:aws:codestar-connections:us-east-2:100209637061:connection/56444933-fb51-4811-b192-7dcefdf0beb2',
    //   output: appSourceArtifact,
    //   branch: 'main',
    // });