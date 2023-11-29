/** @format */

"use strict";
const path = require("path");
const os = require("os");
const fs = require("fs");
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const gcp = require("@pulumi/gcp");
const random = require("@pulumi/random");
require("dotenv").config();

const config = new pulumi.Config();
const awsProfile = config.require("profile");
const vpcCidrBlock = config.require("vpcCidrBlock");
const domainDev = config.require("domainDev");
const domainProd = config.require("domainProd");
const applicationPort = process.env.APPLICATIONPORT;
const allowedPorts = process.env.ALLOWED_PORTS.split(",").map(Number);
const customAmiId = process.env.PACKER_AMI_ID;
let numberOfSubnets = process.env.NUMBER_OF_SUBNETS;
const instance = process.env.INSTANCE;
const subnetNumber = process.env.SUBNET_INDEX;
const isPublicSubnet = process.env.IS_PUBLIC_SUBNET;
const isAssociatePublicIpAddress = process.env.ASSOCIATE_PUBLIC_IP_ADDRESS;
const volumeSize = process.env.VOLUME_SIZE;
const volumeType = process.env.VOLUME_TYPE;
const isDeleteOnTermination = process.env.IS_DELETE_ON_TERMINATION;
const isDisableApiTermination = process.env.IS_DISABLE_API_TERMINATION;
const instanceInitiatedShutdownBehavior = process.env.BEHAVIOUR_ON_TERMINATION;
const desiredCapacity = process.env.DESIRED_CAPACITY;
const minimumCapacitySize = process.env.MINIMUM_CAPACITY_SIZE;
const maximumCapacitySize = process.env.MAXIMUM_CAPACITY_SIZE;
const autoScalingCoolDown = process.env.AUTO_SCALING_COOL_DOWN;
const evaluationPeriods = process.env.EVALUATION_PERIODS;
const upperThreshold = process.env.UPPER_THRESHOLD;
const lowerThreshold = process.env.LOWER_THRESHOLD;

const pubKey = config.require("pubKey");
const publicKey = path.join(os.homedir(), pubKey);
const keyContent = fs.readFileSync(publicKey, "utf8");

const vpc = new aws.ec2.Vpc("webapp-vpc", {
  cidrBlock: vpcCidrBlock,
});

const keyPair = new aws.ec2.KeyPair("key-pair-ec2", {
  publicKey: keyContent,
});

const internetGateway = new aws.ec2.InternetGateway("vpc-internet-gateway", {
  vpcId: vpc.id,
});

const availabilityZones = pulumi
  .output(aws.getAvailabilityZones({}))
  .apply((azs) => azs.names);

const rdsParameterGroup = new aws.rds.ParameterGroup("rds-parameter-group", {
  family: "mysql8.0", // postgres or mariadb
  description: "RDS Parameter Group for MySQL DB",
});

availabilityZones.apply(async (availabilityZone) => {
  const totalZones = availabilityZone.length;
  if (totalZones < Number(numberOfSubnets)) {
    numberOfSubnets = totalZones;
  }

  const createSubnets = (type, offsetStart) => {
    const subnets = [];
    let cidrOffset = offsetStart;
    const vpcCidrParts = vpcCidrBlock.split(".");
    const subnetMask = vpcCidrBlock.endsWith("/24") ? 27 : 24;

    for (let i = 0; i < numberOfSubnets; i++) {
      const availabilityZoneIndex = i % totalZones;

      let cidr;
      if (subnetMask === 27) {
        cidr = `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${vpcCidrParts[2]}.${
          i * 32 + cidrOffset * 32
        }/27`;
      } else {
        cidr = `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${
          i * 10 + cidrOffset
        }.0/24`;
      }

      subnets.push(
        new aws.ec2.Subnet(type + "-subnet-" + i.toString(), {
          vpcId: vpc.id,
          cidrBlock: cidr,
          availabilityZone: availabilityZone[availabilityZoneIndex],
          mapPublicIpOnLaunch: type === "public",
        })
      );
      cidrOffset += 1;
    }

    return subnets;
  };

  const publicSubnets = createSubnets("public", 0);
  const privateSubnets = createSubnets("private", 3);

  const publicRouteTable = new aws.ec2.RouteTable("webapp-public-route-table", {
    vpcId: vpc.id,
  });

  publicSubnets.forEach((subnet, i) => {
    new aws.ec2.RouteTableAssociation(
      "public-route-table-association-" + i.toString(),
      {
        routeTableId: publicRouteTable.id,
        subnetId: subnet.id,
      }
    );
  });

  new aws.ec2.Route("webapp-public-route", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
  });

  const privateRouteTable = new aws.ec2.RouteTable(
    "webapp-private-route-table",
    {
      vpcId: vpc.id,
    }
  );

  privateSubnets.forEach((subnet, i) => {
    new aws.ec2.RouteTableAssociation(
      "private-route-table-association-" + i.toString(),
      {
        routeTableId: privateRouteTable.id,
        subnetId: subnet.id,
      }
    );
  });

  const loadBalancerSecurityGroup = new aws.ec2.SecurityGroup("load-balancer", {
    vpcId: vpc.id,
    description: "Security group for load balancer to access web app",
    ingress: [
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    egress: [
      {
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
    tags: {
      Name: "LoadBalancerSecurityGroup",
    },
  });

  const applicationSecurityGroup = new aws.ec2.SecurityGroup(
    "application-security-group",
    {
      vpcId: vpc.id,
      ingress: [
        ...allowedPorts.map((port) => ({
          protocol: "tcp",
          fromPort: port,
          toPort: port,
          securityGroups: [loadBalancerSecurityGroup.id],
        })),
        {
          protocol: "tcp",
          fromPort: applicationPort,
          toPort: applicationPort,
          securityGroups: [loadBalancerSecurityGroup.id],
        },
      ],
      egress: [
        {
          protocol: "tcp",
          fromPort: 0,
          toPort: 0,
          protocol: "-1",
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    }
  );

  const dbSecurityGroup = new aws.ec2.SecurityGroup("database-security-group", {
    vpcId: vpc.id,
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3306,
        toPort: 3306,
        securityGroups: [applicationSecurityGroup.id],
      },
    ],
    tags: {
      Name: "database-security-group",
    },
  });

  // applicationSecurityGroup.egress = [
  //   {
  //     protocol: "tcp",
  //     fromPort: 3306,
  //     toPort: 3306,
  //     cidrBlocks: [vpc.cidrBlock],
  //   },
  //   {
  //     protocol: "tcp",
  //     fromPort: 3306,
  //     toPort: 3306,
  //     securityGroups: [dbSecurityGroup.id],
  //   },
  // ];

  const dbSubnetGroup = new aws.rds.SubnetGroup("db-subnet-group", {
    subnetIds: privateSubnets.map((subnet) => subnet.id),
  });

  const rdsInstance = new aws.rds.Instance("rds-instance", {
    engine: "mysql",
    instanceClass: "db.t2.micro",
    dbSubnetGroupName: dbSubnetGroup.name,
    publiclyAccessible: false,
    allocatedStorage: 20,
    storageType: volumeType,
    dbName: process.env.DATABASE,
    username: process.env.USER_DB,
    password: process.env.PASS,
    parameterGroupName: rdsParameterGroup.name,
    skipFinalSnapshot: true,
    vpcSecurityGroupIds: [dbSecurityGroup.id],
    multiAz: false,
    identifier: "csye6225",
  });

  const latestAmiCreated = pulumi
    .output(
      aws.ec2.getAmi({
        filters: [
          {
            name: "name",
            values: ["WEBAPP*"],
          },
        ],
        mostRecent: true,
      })
    )
    .apply((ami) => ami.id);

  const dataSettings = pulumi
    .all([
      rdsInstance.address,
      rdsInstance.username,
      rdsInstance.password,
      rdsInstance.dbName,
    ])
    .apply(([host, user, pass, database]) => {
      return {
        HOST: host,
        USER: user,
        PASS: pass,
        DATABASE: database,
      };
    });

  const snsTopic = new aws.sns.Topic("mySNSTopic", {
    displayName: "My SNS Topic",
  });

  const snsTopicArn = snsTopic.arn.apply((arn) => arn);

  snsTopicArn.apply((topicArn) => {
    dataSettings.apply((settings) => {
      const userData = `#!/bin/bash
sudo touch /home/saitejsunkara/.env
sudo touch /home/saitejsunkara/assignments/.env
sudo echo DATABASE=${process.env.DATABASE} >> /home/saitejsunkara/.env
sudo echo HOST=${settings.HOST} >> /home/saitejsunkara/.env
sudo echo USER=${settings.USER} >> /home/saitejsunkara/.env
sudo echo PASS=${settings.PASS} >> /home/saitejsunkara/.env
sudo echo DIALECT=${process.env.DIALECT} >> /home/saitejsunkara/.env
sudo echo SMTP=${process.env.SMTP} >> /home/saitejsunkara/.env
sudo echo SMTP_PORT=${process.env.SMTP_PORT} >> /home/saitejsunkara/.env
sudo echo MAIL_IAM_USERNAME=${process.env.MAIL_IAM_USERNAME} >> /home/saitejsunkara/.env
sudo echo SMTP_USERNAME=${process.env.SMTP_USERNAME} >> /home/saitejsunkara/.env
sudo echo SMTP_PASSWORD=${process.env.SMTP_PASSWORD} >> /home/saitejsunkara/.env
sudo echo EMAIL_TO_ADDRESS=${process.env.EMAIL_TO_ADDRESS} >> /home/saitejsunkara/.env
sudo echo TOPIC_ARN=${topicArn} >> /home/saitejsunkara/.env
sudo echo TOPIC_ARN=${topicArn} >> /home/saitejsunkara/assignments/.env
sudo echo AWS_REGION_CHECK=${process.env.AWS_REGION_CHECK} >> /home/saitejsunkara/.env
sudo echo AWS_REGION_CHECK=${process.env.AWS_REGION_CHECK} >> /home/saitejsunkara/assignments/.env
sudo chown saitejsunkara:saitejsunkara /home/saitejsunkara/.env
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/cloudwatch-config.json \
    -s

sudo systemctl start amazon-cloudwatch-agent
sudo systemctl enable amazon-cloudwatch-agent
`;
      const ec2Role = new aws.iam.Role("EC2-ROLE", {
        name: "EC2-ROLE",
        assumeRolePolicy: {
          Version: "2012-10-17",
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Principal: {
                Service: "ec2.amazonaws.com",
              },
            },
          ],
        },
      });

      const cloudwatchpolicy = new aws.iam.RolePolicyAttachment(
        "cloudwatch-agent-policy",
        {
          policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
          role: ec2Role.name,
        }
      );

      const ec2InstanceProfile = new aws.iam.InstanceProfile(
        "EC2-InstanceProfile",
        {
          name: "ec2_profile",
          role: ec2Role.name,
        }
      );

      const base64UserData = Buffer.from(userData).toString("base64");

      // const asgLaunchConfig = new aws.ec2.LaunchTemplate("asg-launch-config", {
      //   imageId: latestAmiCreated,
      //   instanceType: instance,
      //   keyName: keyPair.keyName,
      //   associatePublicIpAddress: isAssociatePublicIpAddress,
      //   userData: base64UserData,
      //   iamInstanceProfile: {
      //     name: ec2InstanceProfile.name,
      //   },
      //   securityGroups: [applicationSecurityGroup.id],
      //   subnetId: publicSubnets[0].id,
      // });

      const asgLaunchConfig = new aws.ec2.LaunchTemplate("asg-launch-config", {
        imageId: latestAmiCreated,
        iamInstanceProfile: {
          name: ec2InstanceProfile.name,
        },
        instanceType: instance,
        keyName: keyPair.keyName,
        vpcSecurityGroupIds: [applicationSecurityGroup.id],
        subnetId: isPublicSubnet
          ? publicSubnets[subnetNumber].id
          : privateSubnets[subnetNumber].id,
        associatePublicIpAddress: isAssociatePublicIpAddress,
        rootBlockDevice: {
          volumeSize: volumeSize,
          volumeType: volumeType,
          deleteOnTermination: isDeleteOnTermination,
        },
        creditSpecification: {
          cpuCredits: "standard",
        },
        tags: {
          Name: "WebApp EC2 Instance - Debain 12",
        },
        disableApiTermination: isDisableApiTermination,
        instanceInitiatedShutdownBehavior: instanceInitiatedShutdownBehavior,
        userData: base64UserData,
      });

      const appLoadBalancer = new aws.lb.LoadBalancer("app-load-balancer", {
        loadBalancerType: "application",
        subnets: publicSubnets.map((subnet) => subnet.id),
        securityGroups: [loadBalancerSecurityGroup.id],
      });

      const targetGroup = new aws.lb.TargetGroup("target-group", {
        port: applicationPort,
        protocol: "HTTP",
        vpcId: vpc.id,
        targetType: "instance",
      });

      const listener = new aws.lb.Listener("listener", {
        loadBalancerArn: appLoadBalancer.arn,
        protocol: "HTTP",
        port: 80,
        defaultActions: [
          {
            type: "forward",
            targetGroupArn: targetGroup.arn,
          },
        ],
      });

      const autoScalingGroup = new aws.autoscaling.Group(
        "webapp-autoscaling-group",
        {
          targetGroupArns: [targetGroup.arn],
          launchTemplate: {
            id: asgLaunchConfig.id,
            version: "$Latest",
          },
          desiredCapacity: desiredCapacity,
          minSize: minimumCapacitySize,
          maxSize: maximumCapacitySize,
          cooldown: autoScalingCoolDown,
          vpcZoneIdentifiers: publicSubnets.map((subnet) => subnet.id),
          tags: [
            {
              key: "Name",
              value: "webapp-autoscaling-instance",
              propagateAtLaunch: true,
            },
          ],
        }
      );

      autoScalingGroup.name.apply((asgName) => {
        const scaleUpPolicy = new aws.autoscaling.Policy("scale-up-policy", {
          scalingAdjustment: 1,
          adjustmentType: "ChangeInCapacity",
          autoscalingGroupName: asgName,
        });
        const scaleDownPolicy = new aws.autoscaling.Policy(
          "scale-down-policy",
          {
            scalingAdjustment: -1,
            adjustmentType: "ChangeInCapacity",
            autoscalingGroupName: asgName,
          }
        );
        const highCpuAlarm = new aws.cloudwatch.MetricAlarm("high-cpu-alarm", {
          metricName: "CPUUtilization",
          namespace: "AWS/EC2",
          statistic: "Average",
          period: 60,
          evaluationPeriods: evaluationPeriods,
          threshold: upperThreshold,
          comparisonOperator: "GreaterThanThreshold",
          dimensions: {
            AutoScalingGroupName: asgName,
          },
          alarmActions: [scaleUpPolicy.arn],
        });
        const lowCpuAlarm = new aws.cloudwatch.MetricAlarm("low-cpu-alarm", {
          metricName: "CPUUtilization",
          namespace: "AWS/EC2",
          statistic: "Average",
          period: 60,
          evaluationPeriods: evaluationPeriods,
          threshold: lowerThreshold,
          comparisonOperator: "LessThanThreshold",
          dimensions: {
            AutoScalingGroupName: asgName,
          },
          alarmActions: [scaleDownPolicy.arn],
        });
        // const asgAttachment = new aws.autoscaling.Attachment("asg-attachment", {
        //   autoscalingGroupName: asgName,
        //   albTargetGroupArn: targetGroup.arn,
        // });

        //   const ec2Instance = new aws.ec2.Instance("webapp-ec2-instance", {
        //     ami: latestAmiCreated,
        //     iamInstanceProfile: ec2InstanceProfile,
        //     instanceType: instance,
        //     keyName: keyPair.keyName,
        //     vpcSecurityGroupIds: [applicationSecurityGroup.id],
        //     subnetId: isPublicSubnet
        //       ? publicSubnets[subnetNumber].id
        //       : privateSubnets[subnetNumber].id,
        //     associatePublicIpAddress: isAssociatePublicIpAddress,
        //     rootBlockDevice: {
        //       volumeSize: volumeSize,
        //       volumeType: volumeType,
        //       deleteOnTermination: isDeleteOnTermination,
        //     },
        //     creditSpecification: {
        //       cpuCredits: "standard",
        //     },
        //     tags: {
        //       Name: "WebApp EC2 Instance - Debain 12",
        //     },
        //     disableApiTermination: isDisableApiTermination,
        //     instanceInitiatedShutdownBehavior: instanceInitiatedShutdownBehavior,
        //     userData: userData,
        //   });

        //   const ec2InstanceAttachment =
        //     new aws.elasticloadbalancingv2.TargetGroupAttachment(
        //       "ec2-tg-attachment",
        //       {
        //         targetGroupArn: targetGroup.arn,
        //         targetId: ec2Instance.id,
        //       }
        //     );

        const domain = awsProfile === "dev" ? domainDev : domainProd;
        const zone = aws.route53.getZone({ name: domain }, { async: true });

        const newRecord = zone.then((information) => {
          return new aws.route53.Record("new_record", {
            zoneId: zone.then((z) => z.zoneId),
            name: zone.then((z) => z.name),
            type: "A",
            aliases: [
              {
                name: appLoadBalancer.dnsName,
                zoneId: appLoadBalancer.zoneId,
                evaluateTargetHealth: true,
              },
            ],
          });
        });

        const webappLogGroup = new aws.cloudwatch.LogGroup("webapp_log_group", {
          name: "csye6225",
        });

        const snsPublishRole = new aws.iam.Role("snsPublishRole", {
          assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                  Service: "sns.amazonaws.com",
                },
              },
            ],
          }),
        });

        const snsPublishPolicy = new aws.iam.Policy("snsPublishPolicy", {
          policy: pulumi.interpolate`{
           "Version": "2012-10-17",
           "Statement": [
             {
               "Effect": "Allow",
               "Action": "sns:Publish",
               "Resource": "${topicArn}"
             }
           ]
         }`,
        });

        new aws.iam.RolePolicyAttachment("snsPublishRolePolicyAttachment", {
          role: ec2Role.name,
          policyArn: snsPublishPolicy.arn,
        });

        const bucket = new gcp.storage.Bucket("my-bucket", {
          location: "US",
          uniformBucketLevelAccess: true,
          forceDestroy: true,
        });

        const serviceAccount = new gcp.serviceaccount.Account(
          "myServiceAccount",
          {
            accountId: process.env.GOOGLE_ACCOUNT_ID,
            displayName: "My Service Account",
          }
        );

        const serviceAccountKey = new gcp.serviceaccount.Key(
          "myServiceAccountKey",
          {
            serviceAccountId: serviceAccount.name,
          }
        );

        const gcpBucketIAMBinding = new gcp.storage.BucketIAMMember(
          "bucketIAMMember",
          {
            bucket: bucket.id,
            role: "roles/storage.objectCreator",
            member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
          }
        );

        const emailTable = new aws.dynamodb.Table("emailTable", {
          attributes: [{ name: "id", type: "S" }],
          hashKey: "id",
          billingMode: "PAY_PER_REQUEST",
        });

        const lambdaRole = new aws.iam.Role("lambdaRole", {
          assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Action: "sts:AssumeRole",
                Principal: {
                  Service: "lambda.amazonaws.com",
                },
                Effect: "Allow",
              },
            ],
          }),
        });

        const lambdaPolicy = new aws.iam.Policy("lambdaPolicy", {
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Action: [
                  "dynamodb:PutItem",
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "logs:DescribeLogStreams",
                  "cloudwatch:PutMetricData",
                  "cloudwatch:GetMetricStatistics",
                  "cloudwatch:ListMetrics",
                  "cloudwatch:DescribeAlarms",
                  "cloudwatch:PutMetricAlarm",
                  "cloudwatch:GetMetricWidgetImage",
                  "cloudwatch:GetMetricData",
                  "cloudwatch:SetAlarmState",
                ],
                Effect: "Allow",
                Resource: "*",
              },
            ],
          }),
        });

        new aws.iam.RolePolicyAttachment("lambdaPolicyAttachment", {
          role: lambdaRole.name,
          policyArn: lambdaPolicy.arn,
        });

        const lambdaFunction = new aws.lambda.Function("myLambdaFunction", {
          code: new pulumi.asset.FileArchive(
            "/Users/saitejsunkara/Desktop/CloudComputing/serverless/serverless.zip"
          ),
          handler: "index.handler",
          role: lambdaRole.arn,
          runtime: "nodejs18.x",
          environment: {
            variables: {
              SNS_TOPIC_ARN: topicArn,
              DYNAMODB_TABLE_NAME: emailTable.name,
              GCS_BUCKET_NAME: bucket.name,
              GCS_SERVICE_ACCOUNT_KEY: serviceAccountKey.privateKey,
              SES_ACCESS_KEY_ID: process.env.SMTP_USERNAME,
              SES_SECRET_ACCESS_KEY: process.env.SMTP_PASSWORD,
              GOOGLE_CLIENT_MAIL: process.env.GOOGLE_CLIENT_MAIL,
              GOOGLE_PROJECT_ID: process.env.GOOGLE_ACCOUNT_ID,
              SMTP: process.env.SMTP,
              SMTP_PORT: process.env.SMTP_PORT,
              SMTP_USERNAME: process.env.SMTP_USERNAME,
              SMTP_PASSWORD: process.env.SMTP_PASSWORD,
              AWS_REGION_CHECK: process.env.AWS_REGION_CHECK,
            },
          },
        });

        const snsInvokeLambda = new aws.lambda.Permission("snsInvokeLambda", {
          action: "lambda:InvokeFunction",
          function: lambdaFunction,
          principal: "sns.amazonaws.com",
          sourceArn: topicArn,
        });

        const lambdaTrigger = new aws.sns.TopicSubscription("lambdaTrigger", {
          endpoint: lambdaFunction.arn.apply((arn) => arn),
          protocol: "lambda",
          topic: topicArn,
        });
      });
    });
  });
});
