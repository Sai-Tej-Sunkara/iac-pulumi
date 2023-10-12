"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");

const vpc = new aws.ec2.Vpc("webapp-vpc", {
    cidrBlock: "10.0.0.0/16",
});

// console.log("VPC")
// console.log(vpc)

const internetGateway = new aws.ec2.InternetGateway("vpc-internet-gateway", {
    vpcId: vpc.id,
});

// console.log("Internet Gateway")
// console.log(internetGateway)

const availabilityZones = pulumi.output(aws.getAvailabilityZones({})).apply(azs => azs.names);

availabilityZones.apply(availabilityZone => {
    const totalZones = availabilityZone.length;
    // console.log("Avaialbility Zones")
    // console.log(totalZones)

    var createSubnets = (type, offsetStart) => {
        const subnets = []
        let cidrOffset = offsetStart

        for(let i=0; i<3; i++) {
            const availabilityZoneIndex = i % totalZones;
            subnets.push(new aws.ec2.Subnet(type+"-subnet-"+i.toString(), {
                vpcId: vpc.id,
                cidrBlock: "10.0."+cidrOffset.toString()+".0/24",
                availabilityZone: availabilityZone[availabilityZoneIndex],
                mapPublicIpOnLaunch: type === "public",
            }));
            cidrOffset += totalZones * 2;
        }

        return subnets;
    }

    const publicSubnets = createSubnets("public", 0);
    const privateSubnets = createSubnets("private", 1);

    // console.log("Public Subnets")
    // console.log(publicSubnets)
    // console.log("Private Subnets")
    // console.log(privateSubnets)

    const publicRouteTable = new aws.ec2.RouteTable("webapp-public-route-table", {
        vpcId: vpc.id,
    });

    // console.log("Public Route Table")
    // console.log(publicRouteTable)

    publicSubnets.forEach((subnet, i) => {
        new aws.ec2.RouteTableAssociation("public-route-table-association-"+i.toString(), {
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

    // console.log("Private Route Table")
    // console.log(privateRouteTable)

    privateSubnets.forEach((subnet, i) => {
        new aws.ec2.RouteTableAssociation("private-route-table-association-"+i.toString(), {
            routeTableId: privateRouteTable.id,
            subnetId: subnet.id,
        });
    });
})