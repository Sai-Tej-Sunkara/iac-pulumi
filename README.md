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

This document provides a comprehensive guide on deploying a Node.js application on a Linux-based virtual machine using `systemd`.

## Table of Contents

- [Introduction](#introduction)
- [Running Your Node.js App With Systemd](#1-running-your-nodejs-app-with-systemd)
- [Setting Up Autorun for JavaScript Using Systemd](#2-setting-up-autorun-for-javascript-using-systemd)
- [Understanding Systemd Units and Unit Files](#3-understanding-systemd-units-and-unit-files)

## Introduction

[Systemd](https://www.freedesktop.org/wiki/Software/systemd/) is an init system used in Linux distributions to bootstrap the user space and manage all processes subsequently. It provides functionalities like starting, stopping, and restarting services, and it's integral in ensuring services run reliably and can recover from failures.

In the context of deploying web applications, `systemd` can ensure that your Node.js app is always running, even after system reboots or application crashes.

## 1. Running Your Node.js App With Systemd

Systemd manages and configures the application process through a service unit. For your Node.js application, the systemd service file, named `webapp.service`, is provided in the code. This service file ensures that:

- The app starts automatically when the machine boots up.
- The app restarts if it happens to crash.

### Steps:

1. **Ensure Systemd Compatibility:** Ensure that your EC2 instance's operating system supports `systemd`. Modern Linux distributions like Ubuntu 18.04 and later, CentOS 7 and later, and Debian 8 and later support it.
   
2. **Placement of Service File:** The service file is strategically placed in the `/etc/systemd/system/` directory which is the location where custom service files are read from.

3. **Systemd Commands**:
    - `sudo systemctl daemon-reload`: Reloads the systemd manager configuration.
    - `sudo systemctl enable webapp.service`: Ensures the service starts on boot.
    - `sudo systemctl start webapp.service`: Initiates the service.
    - `sudo systemctl status webapp.service`: Shows the status of the service.

## 2. Setting Up Autorun for JavaScript Using Systemd

By setting up autorun, you ensure that your application is always running. The provided code manages this using the following steps:

1. **Service File Creation:** The `webapp.service` file describes the service's specifics, including the path to the application and the environment variables it requires.

2. **Service File Configuration:** The service runs the Node.js application located at `/home/admin/webapp/app.js`.

3. **Reload, Enable, Start, and Check**:
    - Systemd is instructed to reload its configuration to recognize the new service file.
    - The service is enabled to guarantee its activation on boot.
    - The service starts immediately.
    - The service's status provides feedback on its current state.

## 3. Understanding Systemd Units and Unit Files

- **Unit:** Units are resources that `systemd` knows how to manage. They are identified by their type, such as service, mount, device, etc. For the provided code, the unit of interest is the service that runs the Node.js app.
  
- **Unit File:** This is a configuration file that defines properties and behaviors of the unit. It specifies how to start or stop the unit, when to start it, dependencies, and other crucial information.
  
  In our Node.js deployment scenario, the `webapp.service` file serves as the unit file. It encapsulates instructions on how to run the application as a service.

---

**Note**: Before executing the provided code, ensure all necessary environment variables and configurations are correctly set up. The EC2 instance should have Node.js installed, and it should be compatible with the provided systemd configuration.
