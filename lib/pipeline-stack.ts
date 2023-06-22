import { Stack, StackProps, Duration, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    CodePipeline,
    ShellStep,
    CodePipelineSource,
} from 'aws-cdk-lib/pipelines';
import { CARMATECH_CONFIG } from '@lib/configuration';
import { CompositePrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Credentials, DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion } from 'aws-cdk-lib/aws-rds';
import { InstanceClass, InstanceSize, InstanceType, InterfaceVpcEndpointAwsService, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { Artifact } from 'aws-cdk-lib/aws-codepipeline';
import { CarmaTechPipelineStage } from './pipeline-stage';
import { CodeBuildAction, GitHubSourceAction, GitHubTrigger } from 'aws-cdk-lib/aws-codepipeline-actions';
import { BuildSpec, LinuxArmBuildImage, LinuxBuildImage, PipelineProject } from 'aws-cdk-lib/aws-codebuild';



export class PipelineStack extends Stack {
    constructor(scope: Construct, id: string, props: StackProps) {
        super(scope, id, props);

        const pipelineName = 'CaramaTechInfraDeploymentPipeline';
        const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;

        const sourceArtifact = new Artifact();

        const appsourceAction = new GitHubSourceAction({
            actionName: 'Get_App_Source',
            owner: 'abdullah5abid',
            repo: 'carmaAPI',
            output: sourceArtifact,
            branch: 'main',
            oauthToken: SecretValue.secretsManager('github-token'),
            trigger: GitHubTrigger.WEBHOOK,

        });

        

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

        // Create instances
        const engine = DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_31 });
        const instanceType = InstanceType.of(InstanceClass.T3, InstanceSize.MICRO);
        const port = 3306;
        const dbName = 'carma-tech_db';

        // VPC for RDS 
        const vpc = new Vpc(this, "VPC", {
            vpcName: "rds-vpc",
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [
                {
                    subnetType: SubnetType.PRIVATE_ISOLATED,
                    cidrMask: 24,
                    name: 'rds'
                }
            ]
        });

        // Security Groups
        const securityGroupResovlers = new SecurityGroup(this, 'SecurityGroupResolvers', {
            vpc,
            securityGroupName: 'resolvers-sg',
            description: 'Security Group with Resolvers',
        })
        const securityGroupRds = new SecurityGroup(this, 'SecurityGroupRds', {
            vpc,
            securityGroupName: 'rds-sg',
            description: 'Security Group with RDS',
        });

        // Ingress and Engress Rules
        securityGroupRds.addIngressRule(
            securityGroupResovlers,
            Port.tcp(port),
            'Allow inbound traffic to RDS'
        )

        // VPC interfaces
        vpc.addInterfaceEndpoint('LAMBDA', {
            service: InterfaceVpcEndpointAwsService.LAMBDA,
            subnets: { subnets: vpc.isolatedSubnets },
            securityGroups: [securityGroupResovlers],
        });

        vpc.addInterfaceEndpoint('SECRETS_MANAGER', {
            service: InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            subnets: { subnets: vpc.isolatedSubnets },
            securityGroups: [securityGroupResovlers],
        });

        // IAM Role
        const role = new Role(this, 'Role', {
            roleName: 'rds-role',
            description: 'Role used in the RDS stacks',
            assumedBy: new CompositePrincipal(
                new ServicePrincipal('ec2.amazonaws.com'),
                new ServicePrincipal('lambda.amazonaws.com'),
            )
        })
        role.addToPolicy(
            new PolicyStatement({
                effect: Effect.ALLOW,
                actions: [
                    'cloudwatch:PutMetricData',
                    'ec2:CreateNetworkInterface',
                    'ec2:DeleteNetworkInterface',
                    'ec2:DescribeNetworkInterfaces',
                    'ec2:DescribeInstances',
                    'ec2:DescribeSubnets',
                    'ec2:DescribeSecurityGroups',
                    'ec2:DescribeRouteTables',
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents',
                    'lambda:InvokeFunction',
                    'secretsmanager:GetSecretValue',
                    'kms:decrypt',
                    'rds-db:connect',
                ],
                resources: ['*']
            })
        );

        // RDS MySQL Instance
        const rdsInstance = new DatabaseInstance(this, 'MySqlRds', {
            vpc,
            securityGroups: [securityGroupRds],
            vpcSubnets: { subnets: vpc.isolatedSubnets },
            availabilityZone: vpc.isolatedSubnets[0].availabilityZone,
            instanceType,
            engine,
            port,
            instanceIdentifier: 'librarydb-instance',
            allocatedStorage: 10,
            maxAllocatedStorage: 10,
            deleteAutomatedBackups: true,
            backupRetention: Duration.millis(0),
            credentials: Credentials.fromUsername('libraryadmin'),
            publiclyAccessible: false
        })
        rdsInstance.secret?.grantRead(role)

        // Secrets for database credentials
        const credentials = Secret.fromSecretCompleteArn(
            this, 'CredentialsSecret',
            // Tony please change this arn according to your configuration
            'arn:aws:secretsmanager:us-east-2:395929101814:secret:Mysql-fa0FVb'
        );
        credentials.grantRead(role);


        // Returns function to connect with RDS instance
        // const createResolver = (name:string, entry:string) => new Function(this, name, {
        //     functionName: name,
        //     // entry: entry,
        //     bundling: {
        //         externalModules: ['mysql2']
        //     },
        //     role,
        //     vpc,
        //     vpcSubnets: { subnets: vpc.isolatedSubnets },
        //     securityGroups: [ securityGroupResovlers ],
        //     environment: {
        //         RDS_ARN: rdsInstance.secret!.secretArn,
        //         CREDENTIALS_ARN: credentials.secretArn,
        //         HOST: rdsInstance.dbInstanceEndpointAddress
        //     }
        // })

        const appBuildPorject = new PipelineProject(this, 'AppBuildProject', {
            environment: {
                buildImage: LinuxBuildImage.STANDARD_6_0
            },
            buildSpec: BuildSpec.fromObject({
                version: '0.2',
                phases: {
                    install: {
                        'runtime-version': { nodejs: '18' },
                        commands: [
                            'npm install',
                            'npm run build'
                        ]
                    },
                    post_build: {
                        commands: [
                            'npm run package',
                        ]
                    },
                },
                artifacts: {
                    'base-directory': 'src',
                    files: [
                        '**/*'
                    ]
                }
            })
        });

        const appBuildOutput = new Artifact();
        const appBuildAction = new CodeBuildAction({
            actionName: 'APP_BUILD',
            input: sourceArtifact,
            project: appBuildPorject,
            outputs: [appBuildOutput]
        });

        // Deploy Prod Stage
        const prodCarmaTech = new CarmaTechPipelineStage(this, 'Prod', {
            env: {
                account: CARMATECH_CONFIG.Prod.ACCOUNT_ID,
                region: CARMATECH_CONFIG.Prod.REGION,
            },
        });
        pipeline.addStage(prodCarmaTech);

        
    }
}

// import { Stack, StackProps, SecretValue } from 'aws-cdk-lib';
// import { Construct } from 'constructs';
// import {
//     CodePipeline,
//     ShellStep,
//     CodePipelineSource,
// } from 'aws-cdk-lib/pipelines';
// import { CompositePrincipal, Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
// import { Credentials, DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, StorageType } from 'aws-cdk-lib/aws-rds';
// import { InstanceClass, InstanceSize, InstanceType, InterfaceVpcEndpointAwsService, Peer, Port, SecurityGroup, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
// import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
// import { CARMATECH_CONFIG } from './configuration';
// import { CarmaTechPipelineStage } from './pipeline-stage';

// export class PipelineStack extends Stack {
//     constructor(scope: Construct, id: string, props: StackProps) {
//         super(scope, id, props);

//         const pipelineName = 'CaramaTechInfraDeploymentPipeline';
//         const account = CARMATECH_CONFIG.Prod.ACCOUNT_ID;

//         // Create a new VPC and Security Group for the RDS instance
//         const vpc = new Vpc(this, 'Vpc', { maxAzs: 2 });
//         const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
//             vpc,
//             description: 'Allow ssh access to ec2 instances',
//             allowAllOutbound: true   // Can be set to false
//         });
//         securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(3306), 'allow mysql access from the world');

//         // Declare a MySQL RDS instance
//         const dbName = 'myDatabase';
//         const secret = Secret.fromSecretCompleteArn(this, 'ImportedSecret', 'arn:aws:secretsmanager:us-east-2:395929101814:secret:Mysql-fa0FVb');
//         const rdsInstance = new DatabaseInstance(this, 'Database', {
//             engine: DatabaseInstanceEngine.mysql({ version: MysqlEngineVersion.VER_8_0_26 }),
//             instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
//             credentials: Credentials.fromSecret(secret),
//             vpc,
//             databaseName: dbName,
//             multiAz: false,
//             allocatedStorage: 25,
//             storageType: StorageType.GP2,
//             deletionProtection: false,
//             vpcSubnets: {
//                 subnetType: SubnetType.PUBLIC,
//             },
//             securityGroups: [securityGroup]
//         });

//         // Define the pipeline
//         const pipeline = new CodePipeline(this, 'Pipeline', {
//             pipelineName: pipelineName,
//             synth: new ShellStep('Synth', {
//                 input: CodePipelineSource.connection(
//                     'abdullah5abid/carmaAPI',
//                     'main',
//                     {
//                         connectionArn: CARMATECH_CONFIG.Prod.ARN,
//                     }
//                 ),
//                 commands: [
//                     'npm install --production',
//                     `sed -i "s/DB_USERNAME=test/DB_USERNAME=${secret.secretValueFromJson('username')}/g" .env`,
//                     `sed -i "s/DB_PASSWORD=password/DB_PASSWORD=${secret.secretValueFromJson('password')}/g" .env`,
//                     `sed -i "s/DB_HOST=localhost/DB_HOST=${rdsInstance.instanceEndpoint.hostname}/g" .env`,
//                     `sed -i "s/DB_DATABASE=test/DB_DATABASE=${dbName}/g" .env`,
//                     'npm run build',
//                     'npm run test',
//                     'npm run cdk synth'
//                 ],
//                 primaryOutputDirectory: 'cdk.out',
//             }),
//         });

//         // Add staging and production stages to the pipeline
//         const staging = new CarmaTechPipelineStage(this, 'Staging', {
//             env: { account: account, region: CARMATECH_CONFIG.Prod.REGION },
//         });
//         // Deploy Prod Stage
//         const prodCarmaTech = new CarmaTechPipelineStage(this, 'Prod', {
//             env: {
//                 account: CARMATECH_CONFIG.Prod.ACCOUNT_ID,
//                 region: CARMATECH_CONFIG.Prod.REGION,
//             },
//         });
        
//         const stagingStage = pipeline.addStage(staging);
//         const prodStage = pipeline.addStage(prodCarmaTech);
//         stagingStage.addPost(
//             new ShellStep('TestStaging', {
//                 commands: ['echo "Testing Staging..."'],
//             })
//         );
//         prodStage.addPost(
//             new ShellStep('TestProd', {
//                 commands: ['echo "Testing Production..."'],
//             })
//         );

        
//         // pipeline.addStage(prodCarmaTech);
//     }
// }
