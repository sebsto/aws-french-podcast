---
title: "Récap reInvent 2025 à froid : Graviton 5, Lambda évolue et les coûts baissent."
description: "Pour ce troisième récap reInvent 2025, nous prenons du recul avec Pascal Martin, AWS Hero et Principal Engineer chez Bedrock Streaming. Contrairement aux deux premiers épisodes enregistrés à chaud depuis Las Vegas, celui-ci nous permet d'analyser les annonces avec plus de perspective.

Pascal partage ses impressions sur une édition très marquée par l'IA, peut-être même un peu trop à son goût. Nous revenons sur la keynote de Matt Garman et ses \"25 nouveautés en 10 minutes\" après presque deux heures consacrées à l'IA, ainsi que sur la dernière keynote de Werner Vogels avec son message sur l'évolution nécessaire des développeurs.

Côté infrastructure, Graviton 5 arrive en preview avec 25% de performances supplémentaires. Pascal explique pourquoi il attend surtout sa disponibilité sur les services managés comme RDS et ElastiCache, où l'impact économique est plus significatif qu'sur les instances spot qu'il utilise massivement.

Lambda connaît des évolutions majeures avec les Durable Functions, qui permettent de mettre en pause une fonction pendant un an, et Lambda sur instances EC2 managées. Nous analysons les cas d'usage de ces nouveautés par rapport à Step Functions et discutons des implications du nouveau modèle de concurrence.

La grande annonce économique reste les Database Saving Plans, attendus depuis des années. Cross-service et cross-région, ils couvrent RDS, DynamoDB, ElastiCache et DMS, avec des économies de 15 à 35%. Pascal regrette juste qu'OpenSearch ne soit pas considéré comme un service de base de données.

Nous évoquons aussi les nouveaux forfaits CloudFront pour rassurer les petites entreprises effrayées par la facturation à l'usage, les agents IA "frontière" pour le DevOps et la sécurité, et quelques améliorations bienvenues comme la transparence accrue d'AWS sur la disponibilité des services par région."
episode: 335
duration: "00:51:58"
size: 70156380
file: "335.mp3"
social-background: "335.png"
category: "podcasts"
publication: "2025-12-12 04:00:00 +0100"
author: "Sébastien Stormacq"
guests:
- name: "Pascal Martin"
  link: https://pascal-martin.fr/
  title: "Principal Engineer, Bedrock Streaming & AWS Hero"
links:
- text: "Les keynotes en vidéo"
  link: https://www.youtube.com/playlist?list=PL2yQDdvlhXf8xcKr0-BHEyg_8VB4tWdu1
- text: "Graviton 5"
  link: https://www.aboutamazon.com/news/aws/aws-graviton-5-cpu-amazon-ec2
- text: "EKS et AWS Backup"
  link: https://aws.amazon.com/about-aws/whats-new/2025/11/aws-backup-supports-amazon-eks/
- text: "Control Plane EKS"
  link: https://aws.amazon.com/blogs/containers/amazon-eks-introduces-provisioned-control-plane/
- text: "Fonctions Lambda durables"
  link: https://aws.amazon.com/blogs/aws/build-multi-step-applications-and-ai-workflows-with-aws-lambda-durable-functions/
- text: "Lambda Managed Instances: faire tourner vos Lambdas sur EC2"
  link: https://aws.amazon.com/blogs/aws/introducing-aws-lambda-managed-instances-serverless-simplicity-with-ec2-flexibility/
- text: "Des fonctions Lambda multi-tenants"
  link: https://aws.amazon.com/blogs/aws/streamlined-multi-tenant-application-development-with-tenant-isolation-mode-in-aws-lambda/
- text: "La roadmap Lambda est publique"
  link: https://github.com/orgs/aws/projects/286
- text: "Unit tests de Step Functions"
  link: https://aws.amazon.com/blogs/aws/accelerate-workflow-development-with-enhanced-local-testing-in-aws-step-functions/
- text: "La limite de taille d'un object S3 passe à 50Tb (x10!)"
  link: https://aws.amazon.com/about-aws/whats-new/2025/12/amazon-s3-maximum-object-size-50-tb/
- text: "Les améliorations de S3 Lens"
  link: https://aws.amazon.com/blogs/aws/amazon-s3-storage-lens-adds-performance-metrics-support-for-billions-of-prefixes-and-export-to-s3-tables/
- text: "Réplication et Intelligent Tiering pour S3 Tables"
  link: https://aws.amazon.com/blogs/aws/announcing-replication-support-and-intelligent-tiering-for-amazon-s3-tables/
- text: "GuardDuty etends ses tests à EC2 et ECS"
  link: https://aws.amazon.com/blogs/aws/amazon-guardduty-adds-extended-threat-detection-for-amazon-ec2-and-amazon-ecs/
- text: "Rotation automatique de secrets pour les SaaS"
  link: https://aws.amazon.com/about-aws/whats-new/2025/11/aws-secrets-manager-managed-external-secrets/
- text: "S3 block public access au niveau des organisations"
  link: https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-s3-block-public-access-organization-level-enforcement/
- text: "Un serveur MCP pour générer des politiques IAM"
  link: https://aws.amazon.com/blogs/aws/simplify-iam-policy-creation-with-iam-policy-autopilot-a-new-open-source-mcp-server-for-builders/
- text: "ABAC pour S3"
  link: https://aws.amazon.com/blogs/aws/introducing-attribute-based-access-control-for-amazon-s3-general-purpose-buckets/
- text: "Les database Savings Plans"
  link: https://aws.amazon.com/blogs/aws/introducing-database-savings-plans-for-aws-databases/
- text: "Plans tarifaires à prix fixes pour CloudFront"
  link: https://aws.amazon.com/blogs/networking-and-content-delivery/introducing-flat-rate-pricing-plans-with-no-overages/
- text: "AWS Devops Agent"
  link: https://aws.amazon.com/fr/blogs/aws/aws-devops-agent-helps-you-accelerate-incident-response-and-improve-system-reliability-preview/
- text: "Kiro Autonomous Agent"
  link: https://kiro.dev/blog/introducing-kiro-autonomous-agent/
- text: "AWS Capabilities"
  link: https://aws.amazon.com/blogs/aws/introducing-aws-capabilities-by-region-for-easier-regional-planning-and-faster-global-deployments/
- text: "Le control plane de Route53 en multi-Regions"
  link: https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-route-53-accelerated-recovery-managing-public-dns-records/
- text: "European Sovereign Cloud"
  link: https://aws.eu
- text: "Code Commit est à nouveau GA"
  link: https://aws.amazon.com/fr/blogs/devops/aws-codecommit-returns-to-general-availability/
- text: "Des clés composites pour les GSI DynamoDB"
  link: https://aws.amazon.com/about-aws/whats-new/2025/11/amazon-dynamodb-multi-attribute-composite-keys-global-secondary-indexes/
---
