"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
require("dotenv").config()

const config = new pulumi.Config();
const vpcCidrBlock = config.require("vpcCidrBlock");

const applicationPort = process.env.APPLICATIONPORT;
const allowedPorts = process.env.ALLOWED_PORTS.split(",").map(Number);
const customAmiId = process.env.PACKER_AMI_ID;
const numberOfSubnets = process.env.NUMBER_OF_SUBNETS;
const instance = process.env.INSTANCE;
const subnetNumber = process.env.SUBNET_INDEX;
const isPublicSubnet = process.env.IS_PUBLIC_SUBNET;
const isAssociatePublicIpAddress = process.env.ASSOCIATE_PUBLIC_IP_ADDRESS;
const volumeSize = process.env.VOLUME_SIZE;
const volumeType = process.env.VOLUME_TYPE;
const isDeleteOnTermination = process.env.IS_DELETE_ON_TERMINATION;
const isDisableApiTermination = process.env.IS_DISABLE_API_TERMINATION;
const instanceInitiatedShutdownBehavior = process.env.BEHAVIOUR_ON_TERMINATION;
const key = process.env.KEY_NAME;

const vpc = new aws.ec2.Vpc("webapp-vpc", {
    cidrBlock: vpcCidrBlock,
});

const internetGateway = new aws.ec2.InternetGateway("vpc-internet-gateway", {
    vpcId: vpc.id,
});

const availabilityZones = pulumi.output(aws.getAvailabilityZones({})).apply(azs => azs.names);

availabilityZones.apply(availabilityZone => {
    const totalZones = availabilityZone.length;

    const createSubnets = (type, offsetStart) => {
        const subnets = [];
        let cidrOffset = offsetStart;
        const vpcCidrParts = vpcCidrBlock.split(".");
        const subnetMask = vpcCidrBlock.endsWith("/24") ? 27 : 24;
    
        for (let i = 0; i < numberOfSubnets; i++) {
            const availabilityZoneIndex = i % totalZones;
    
            let cidr;
            if (subnetMask === 27) {
                cidr = `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${vpcCidrParts[2]}.${i * 32 + cidrOffset * 32}/27`;
            } else {
                cidr = `${vpcCidrParts[0]}.${vpcCidrParts[1]}.${i * 10 + cidrOffset}.0/24`;
            }
    
            subnets.push(new aws.ec2.Subnet(type + "-subnet-" + i.toString(), {
                vpcId: vpc.id,
                cidrBlock: cidr,
                availabilityZone: availabilityZone[availabilityZoneIndex],
                mapPublicIpOnLaunch: type === "public",
            }));
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
        new aws.ec2.RouteTableAssociation("public-route-table-association-" + i.toString(), {
            routeTableId: publicRouteTable.id,
            subnetId: subnet.id,
        });
    });

    new aws.ec2.Route("webapp-public-route", {
        routeTableId: publicRouteTable.id,
        destinationCidrBlock: "0.0.0.0/0",
        gatewayId: internetGateway.id,
    });

    const privateRouteTable = new aws.ec2.RouteTable("webapp-private-route-table", {
        vpcId: vpc.id,
    });

    privateSubnets.forEach((subnet, i) => {
        new aws.ec2.RouteTableAssociation("private-route-table-association-" + i.toString(), {
            routeTableId: privateRouteTable.id,
            subnetId: subnet.id,
        });
    });

    const applicationSecurityGroup = new aws.ec2.SecurityGroup("webapp-security-group", {
        vpcId: vpc.id,
        ingress: [
            ...allowedPorts.map(port => ({
                protocol: "tcp",
                fromPort: port,
                toPort: port,
                cidrBlocks: ["0.0.0.0/0"],
            })),
            {
                protocol: "tcp",
                fromPort: applicationPort,
                toPort: applicationPort,
                cidrBlocks: ["0.0.0.0/0"],
            },
        ],
    });

    const ec2Instance = new aws.ec2.Instance("webapp-ec2-instance", {
        ami: customAmiId,
        instanceType: instance,
        keyName: key,
        vpcSecurityGroupIds: [applicationSecurityGroup.id],
        subnetId: isPublicSubnet?publicSubnets[subnetNumber].id:privateSubnets[subnetNumber].id,
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
    });
});