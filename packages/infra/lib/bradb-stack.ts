import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy, Size, Stack, Tags, type StackProps } from "aws-cdk-lib";
import * as dlm from "aws-cdk-lib/aws-dlm";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRADB_IMPORT_FUNCTION_NAME } from "@cobrac/shared";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

/** Ubuntu 24.04 LTS arm64 (Canonical, 2026-09-23). Pinned: a new image would replace the instance (specification, part 5). */
export const BRADB_AMI: Record<string, string> = { "ap-northeast-1": "ami-03feee0aca5e4f4f6" };
export const BRADB_DATABASE = "bra_db_v4_6";

/**
 * BRA-DB (PostgreSQL 17 + Apache AGE 1.7, schema v4.6) inside AWS, reachable from nowhere outside its VPC.
 * - VPC with one private subnet (instance, registration Lambda) and one public subnet that holds only a NAT instance
 *   for outbound traffic (package updates, Secrets Manager, SSM). Nothing accepts inbound traffic from the internet.
 *   The NAT instance holds an Elastic IP, so traffic from the VPC leaves from one fixed address that outside
 *   databases can allow (output NatPublicIp).
 * - EC2 t4g.small; the cluster lives on a separate encrypted gp3 volume (RETAIN) with daily snapshots (7 kept).
 *   Administration through SSM Session Manager (no SSH).
 * - Role passwords in Secrets Manager (owner `bra`, `cobrac_import`, `cobrac_read`); bootstrap.sh sets them at boot.
 * - The registration Lambda (BRADB_IMPORT_FUNCTION_NAME) is invoked by the CobracAgents API with a version's package.
 */
export class BraDbStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    // CDK's default NAT script runs `yum install` (killed for memory on a t4g.nano) and `route` (not on AL2023)
    const natUserData = ec2.UserData.forLinux();
    natUserData.addCommands(
      "set -eux",
      "if ! swapon --show | grep -q /swapfile; then fallocate -l 512M /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile; fi",
      "for i in 1 2 3 4 5; do dnf install -y iptables-services && break; sleep 15; done",
      "systemctl enable --now iptables",
      "echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/90-nat.conf && sysctl -p /etc/sysctl.d/90-nat.conf",
      "IF=$(ip route show default | awk '{print $5; exit}')",
      'iptables -t nat -C POSTROUTING -o "$IF" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -o "$IF" -j MASQUERADE',
      "iptables -F FORWARD",
      "service iptables save",
    );
    const nat = ec2.NatProvider.instanceV2({
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({ cpuType: ec2.AmazonLinuxCpuType.ARM_64 }),
      defaultAllowedTraffic: ec2.NatTrafficDirection.OUTBOUND_ONLY,
      userData: natUserData,
    });
    const vpc = new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.42.0.0/24"),
      maxAzs: 1,
      natGateways: 1,
      natGatewayProvider: nat,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 26 },
        { name: "private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 26 },
      ],
      gatewayEndpoints: { S3: { service: ec2.GatewayVpcEndpointAwsService.S3 } },
    });
    nat.connections.allowFrom(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.allTraffic(), "outbound traffic of the private subnet");
    // a NAT instance runs its user data only once: a new logical ID replaces it whenever its setup changes
    const natInstance = vpc.publicSubnets[0].node.findChild("NatInstance").node.defaultChild as ec2.CfnInstance;
    natInstance.overrideLogicalId("NatInstanceMicro");
    // a fixed outbound address for outside allowlists; RETAIN keeps it when the stack goes, and a replaced NAT instance takes it over
    const natEip = new ec2.CfnEIP(this, "NatEip", { domain: "vpc", tags: [{ key: "Name", value: "cobrac-bradb-nat" }] });
    natEip.applyRemovalPolicy(RemovalPolicy.RETAIN);
    new ec2.CfnEIPAssociation(this, "NatEipAssociation", { allocationId: natEip.attrAllocationId, instanceId: natInstance.ref });

    const secret = (name: string, username: string) =>
      new secretsmanager.Secret(this, name, {
        secretName: `cobrac/bradb/${username}`,
        description: `BRA-DB role ${username}`,
        generateSecretString: { secretStringTemplate: JSON.stringify({ username }), generateStringKey: "password", excludePunctuation: true, passwordLength: 32 },
      });
    const ownerSecret = secret("OwnerSecret", "bra");
    const importSecret = secret("ImportSecret", "cobrac_import");
    const readSecret = secret("ReadSecret", "cobrac_read");

    const subnet = vpc.privateSubnets[0];
    const dataVolume = new ec2.Volume(this, "DataVolume", {
      availabilityZone: subnet.availabilityZone,
      size: Size.gibibytes(20),
      volumeType: ec2.EbsDeviceVolumeType.GP3,
      encrypted: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    Tags.of(dataVolume).add("bradb-backup", "daily");

    const dbSg = new ec2.SecurityGroup(this, "DbSg", { vpc, allowAllOutbound: true, description: "BRA-DB PostgreSQL: 5432 from the registration Lambda only" });
    const role = new iam.Role(this, "DbRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")],
    });
    for (const s of [ownerSecret, importSecret, readSecret]) s.grantRead(role);
    const bootstrap = new s3assets.Asset(this, "Bootstrap", { path: resolve(repoRoot, "packages/infra/bradb") });
    bootstrap.grantRead(role);

    // runs at every boot (cloud_final_modules: scripts-user always): a changed asset arrives with a stop/start
    const userData = new ec2.MultipartUserData();
    userData.addPart(ec2.MultipartBody.fromRawBody({ contentType: 'text/cloud-config; charset="utf8"', body: "#cloud-config\ncloud_final_modules:\n  - [scripts-user, always]\n" }));
    const script = ec2.UserData.forLinux();
    script.addCommands(
      "set -euo pipefail",
      "install -d -m 0700 /etc/bradb",
      [
        "cat > /etc/bradb/bradb.env <<'EOF'",
        `AWS_REGION=${this.region}`,
        `BRADB_VOLUME_ID=${dataVolume.volumeId}`,
        `BRADB_ALLOWED_CIDR=${vpc.vpcCidrBlock}`,
        `BRADB_SECRET_OWNER=${ownerSecret.secretArn}`,
        `BRADB_SECRET_IMPORT=${importSecret.secretArn}`,
        `BRADB_SECRET_READ=${readSecret.secretArn}`,
        "EOF",
      ].join("\n"),
      "command -v aws >/dev/null 2>&1 || snap install aws-cli --classic",
      `aws s3 cp --region ${this.region} s3://${bootstrap.s3BucketName}/${bootstrap.s3ObjectKey} /tmp/bradb.zip`,
      "rm -rf /opt/bradb && mkdir -p /opt/bradb && python3 -m zipfile -e /tmp/bradb.zip /opt/bradb && chmod +x /opt/bradb/bootstrap.sh",
      "/opt/bradb/bootstrap.sh >> /var/log/bradb-bootstrap.log 2>&1",
    );
    userData.addUserDataPart(script, ec2.MultipartBody.SHELL_SCRIPT, true);

    const instance = new ec2.Instance(this, "Db", {
      vpc,
      vpcSubnets: { subnets: [subnet] },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.SMALL),
      machineImage: ec2.MachineImage.genericLinux(BRADB_AMI),
      securityGroup: dbSg,
      role,
      userData,
      requireImdsv2: true,
      disableApiTermination: true,
      blockDevices: [{ deviceName: "/dev/sda1", volume: ec2.BlockDeviceVolume.ebs(16, { volumeType: ec2.EbsDeviceVolumeType.GP3, encrypted: true }) }],
    });
    new ec2.CfnVolumeAttachment(this, "DataVolumeAttachment", { instanceId: instance.instanceId, volumeId: dataVolume.volumeId, device: "/dev/sdf" });

    const snapshotRole = new iam.Role(this, "SnapshotRole", {
      assumedBy: new iam.ServicePrincipal("dlm.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSDataLifecycleManagerServiceRole")],
    });
    new dlm.CfnLifecyclePolicy(this, "DailySnapshots", {
      // DLM accepts letters, digits, spaces, hyphens and underscores only
      description: "BRA-DB data volume daily snapshots - 7 kept",
      state: "ENABLED",
      executionRoleArn: snapshotRole.roleArn,
      policyDetails: {
        resourceTypes: ["VOLUME"],
        targetTags: [{ key: "bradb-backup", value: "daily" }],
        schedules: [{ name: "daily", createRule: { interval: 24, intervalUnit: "HOURS", times: ["18:00"] }, retainRule: { count: 7 }, copyTags: true }],
      },
    });

    const fnSg = new ec2.SecurityGroup(this, "ImportFnSg", { vpc, allowAllOutbound: true, description: "BRA-DB registration Lambda" });
    dbSg.addIngressRule(fnSg, ec2.Port.tcp(5432), "registration Lambda");
    const fn = new NodejsFunction(this, "ImportFn", {
      functionName: BRADB_IMPORT_FUNCTION_NAME,
      entry: resolve(repoRoot, "packages/api/src/handlers/bradbImport.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(25),
      vpc,
      vpcSubnets: { subnets: [subnet] },
      securityGroups: [fnSg],
      environment: { BRADB_SECRET_ARN: importSecret.secretArn, BRADB_HOST: instance.instancePrivateIp, BRADB_DB: BRADB_DATABASE },
      logGroup: new logs.LogGroup(this, "ImportFnLogs", { retention: logs.RetentionDays.TWO_WEEKS, removalPolicy: RemovalPolicy.DESTROY }),
      bundling: {
        format: OutputFormat.ESM,
        target: "node22",
        minify: true,
        sourceMap: false,
        externalModules: ["@aws-sdk/*", "pg-native"],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    importSecret.grantRead(fn);

    new CfnOutput(this, "InstanceId", { value: instance.instanceId });
    new CfnOutput(this, "DataVolumeId", { value: dataVolume.volumeId });
    new CfnOutput(this, "ImportFunctionName", { value: fn.functionName });
    new CfnOutput(this, "OwnerSecretArn", { value: ownerSecret.secretArn });
    new CfnOutput(this, "ReadSecretArn", { value: readSecret.secretArn });
    new CfnOutput(this, "NatPublicIp", { value: natEip.ref, description: "Fixed outbound IPv4 of the BRA-DB VPC (for outside allowlists)" });
    cdk.Tags.of(this).add("cobrac:component", "bradb");
  }
}
