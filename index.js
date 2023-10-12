"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");

const vpc = new aws.ec2.Vpc("webapp-vpc", {
    cidrBlock: "10.0.0.0/16",
});

const internetGateway = new aws.ec2.InternetGateway("vpc-internet-gateway", {
    vpcId: vpc.id,
});

const availabilityZones = pulumi.output(aws.getAvailabilityZones({})).apply(azs => azs.names);

availabilityZones.apply(availabilityZone => {
    const totalZones = availabilityZone.length;

    var createSubnets = (type, offsetStart) => {
        const subnets = [];
        let cidrOffset = offsetStart;

        for (let i = 0; i < 3; i++) {
            const availabilityZoneIndex = i % totalZones;
            subnets.push(new aws.ec2.Subnet(type + "-subnet-" + i.toString(), {
                vpcId: vpc.id,
                cidrBlock: `10.0.${i * 10 + cidrOffset}.0/24`,
                availabilityZone: availabilityZone[availabilityZoneIndex],
                mapPublicIpOnLaunch: type === "public",
            }));
            cidrOffset += 1;
        }

        return subnets;
    }

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
})
