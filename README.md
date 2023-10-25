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

# Node.js App Deployment with Systemd

This guide covers setting up a Node.js application to run automatically on a virtual machine using `systemd`.

## 1. Running Your Node.js App With Systemd

Systemd is a system and service manager for Linux operating systems. In the context of your application, it is being used to manage the lifecycle of your Node.js app on an EC2 instance.

In the provided code, a systemd service file `webapp.service` is created and configured to run the Node.js application. This service file ensures that the app starts automatically upon system boot and restarts if it crashes.

To utilize this functionality:

1. Ensure your EC2 instance's OS supports systemd (most modern Linux distributions do).
2. The service file is placed in `/etc/systemd/system/` directory.
3. Commands are executed to reload the systemd manager configuration, to start the service during boot, and to initiate the service.

## 2. How To Setup Autorun a JavaScript Using Systemd

In the provided code, the following steps are taken to set up autorun:

1. A service file named `webapp.service` is created. This file describes how to manage the service.
2. The service is set to run the Node.js application found in `/home/admin/webapp/app.js`.
3. Systemd is instructed to reload its configuration.
4. The service is enabled, ensuring it runs on boot.
5. The service is started.
6. The status of the service is displayed.

## 3. Understanding Systemd Units and Unit Files

- **Unit:** In systemd, a unit refers to any resource that the system knows how to operate on and manage. This can be a service, a mounted file system, a device, etc.
- **Unit File:** A unit file is a configuration file that describes the properties of the unit. For example, for services, a `.service` file describes how to start or stop the service, under which circumstances, and its dependencies.

In the provided code, the unit is the Node.js application, and the unit file is `webapp.service`. This file is responsible for describing how to run the app as a service using systemd.

---

**Note**: Ensure you have the necessary environment variables and configurations set up, as they are utilized within the provided code. Also, ensure your EC2 instance has Node.js installed and is compatible with the systemd configuration.

