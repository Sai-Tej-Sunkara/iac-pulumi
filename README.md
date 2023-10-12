# Pulumi AWS Infrastructure Deployment
 
## Overview
 
This Pulumi project provisions a VPC along with associated resources like Internet Gateway, Subnets, and Route Tables on AWS.
 
## Prerequisites
 
- [Node.js](https://nodejs.org/)
- [Pulumi CLI](https://www.pulumi.com/docs/get-started/install/)
- [AWS CLI](https://aws.amazon.com/cli/)
 
## Getting Started
 
### AWS Credentials
 
Configure your AWS credentials using AWS CLI:
 
```bash
aws configure --profile [your_profile_name]
```
 
### Install Dependencies
 
```
npm install
```
 
### Pulumi initialization  or use Pulumi<stack>.yaml
```
pulumi stack init [stack_name]
pulumi config set aws:region [your_aws_region]
pulumi config set aws:profile [your_profile_name]
pulumi config set vpcCidrBlock [your_vpc_cidr_block]
```
 
### Deployment
 
```
pulumi up
```
 
### Usage
 
After deployment, you'll have a VPC configured with the following resources in AWS:
 
- Internet Gateway
- Public and Private Subnets
- Associated Route Tables
 
### Cleanup
 
```
pulumi destroy
```