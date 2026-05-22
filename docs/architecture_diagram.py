"""
Mini-Jira on AWS — architecture diagram generator.

Renders docs/architecture-diagram.png using the official AWS service icons
via the `diagrams` library (https://diagrams.mingrammer.com).

Prerequisites:
    pip install diagrams
    Graphviz on PATH   (Windows:  winget install Graphviz.Graphviz)

Run from the project root:
    python docs/architecture_diagram.py
"""
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import CloudFront, ELB, VPC, InternetGateway
from diagrams.aws.compute import EC2, Lambda
from diagrams.aws.storage import S3
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import SNS, SQS, Eventbridge
from diagrams.aws.security import Cognito, IAM
from diagrams.aws.management import Cloudwatch
from diagrams.aws.general import Users

graph_attr = {
    "fontsize": "16",
    "bgcolor": "white",
    "pad": "0.7",
    "nodesep": "0.7",
    "ranksep": "1.4",
}

with Diagram(
    "Mini-Jira on AWS — High-Availability Architecture",
    filename="docs/architecture-diagram",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
):
    users = Users("Users / Browser")
    cdn = CloudFront("CloudFront\n(CDN, HTTPS)")
    frontend = S3("S3\nReact SPA")

    with Cluster("VPC  10.0.0.0/16  —  eu-central-1"):
        igw = InternetGateway("Internet Gateway")

        with Cluster("Public subnets  (AZ-a + AZ-b)"):
            alb = ELB("Application\nLoad Balancer")
            nat = EC2("NAT Instance")

        with Cluster("Private subnets  (AZ-a + AZ-b)"):
            with Cluster("Auto Scaling Group  (min 2 / max 4)"):
                api = [
                    EC2("Express API\nAZ-a"),
                    EC2("Express API\nAZ-b"),
                ]

    with Cluster("Data & Auth"):
        ddb = Dynamodb("DynamoDB\n6 tables")
        cognito = Cognito("Cognito\nUser Pool")

    with Cluster("Image Pipeline"):
        s3_orig = S3("S3 Originals\n(versioned)")
        resize = Lambda("Lambda\nImage Resize")
        s3_resized = S3("S3 Resized")

    with Cluster("Event-Driven Notifications"):
        sns = SNS("SNS\ntask-assigned")
        sqs = SQS("SQS Queue")
        worker = Lambda("Lambda\nAssignment Worker")
        bridge = Eventbridge("EventBridge\n9AM daily")
        digest = Lambda("Lambda\nDaily Digest")

    with Cluster("Monitoring & Security"):
        cw = Cloudwatch("CloudWatch\ndashboard + alarm")
        iam = IAM("IAM Roles")

    # --- request flow ---------------------------------------------------
    users >> cdn
    cdn >> Edge(label="default  /*") >> frontend
    cdn >> Edge(label="/api/*") >> alb
    alb >> Edge(label="port 3001") >> api
    nat >> igw

    # --- backend -> AWS services ---------------------------------------
    # Edges drawn from one representative instance to keep the diagram
    # readable; both ASG instances make the same calls.
    api[0] >> ddb
    api[0] >> cognito
    api[0] >> s3_orig
    api[0] >> sns
    api[0] >> cw

    # --- image pipeline -------------------------------------------------
    s3_orig >> Edge(label="S3 PUT event") >> resize >> s3_resized

    # --- event-driven notifications ------------------------------------
    sns >> Edge(label="email", style="dashed") >> users
    sns >> sqs >> worker
    worker >> ddb
    worker >> cw
    bridge >> digest >> sns
    cw >> Edge(label="alarm", style="dashed") >> sns

    # --- IAM (least-privilege role assumed by the instances) -----------
    iam >> Edge(style="dotted", label="assumes role") >> api[0]
