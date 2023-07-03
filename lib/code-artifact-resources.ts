import { Stack, Stage, CfnOutput, StageProps } from 'aws-cdk-lib';
import { Repository } from 'aws-cdk-lib/aws-ecr'
import { Construct } from 'constructs';

/*
aws terms:
    ecr: elastic container repository, for storing docker images.
*/
export class CodeArtifactResourcesStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const ecrRepository = new Repository(
        this, 'carmatech-ecr-artifacts-repo'
    )

    new CfnOutput(this, 'carmatech-ecr-artifacts-repo-name', { value: ecrRepository.repositoryName })
    new CfnOutput(this, 'carmatech-ecr-artifacts-repo-uri', { value: ecrRepository.repositoryUri })
    new CfnOutput(this, 'carmatech-ecr-artifacts-repo-arn', { value: ecrRepository.repositoryArn })
  }
}