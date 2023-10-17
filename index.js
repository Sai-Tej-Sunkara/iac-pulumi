"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
require("dotenv").config()

const config = new pulumi.Config();
const vpcCidrBlock = config.require("vpcCidrBlock");

const applicationPort = process.env.APPLICATIONPORT;
const allowedPorts = process.env.ALLOWED_PORTS.split(",").map(Number);

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
    
        for (let i = 0; i < 3; i++) {
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