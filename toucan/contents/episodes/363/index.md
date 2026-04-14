---
title: "CFM : 60000 CPUs et des milliers de jobs sur AWS Batch"
description: "Capital Fund Management (CFM) est un gestionnaire de fonds quantitatif qui emploie 110 PhD dans ses équipes de recherche et où 75% des effectifs écrivent du code. Dans cet épisode enregistré au AWS Summit Paris, Julien Lafaye (directeur) et Otmane El Ansary (associé) nous expliquent comment ils ont migré leur plateforme de calcul CFM Graph depuis leur infrastructure on-prem vers AWS. CFM Graph permet aux chercheurs de définir des graphes d'exécution où chaque noeud est une fonction Python. L'architecture repose sur API Gateway, Lambda et DynamoDB pour le control plane, avec AWS Batch pour l'exécution des calculs. La plateforme scale jusqu'à 100 000 vCPU et traiter des graphes générant jusqu'à 80 TB de données en output. L'équipe utilise massivement les instances Spot (80-90% des calculs de recherche) pour optimiser les coûts. On découvre les défis rencontrés : gestion des quotas Lambda et DynamoDB, rate limiting S3 sur les requêtes LIST, allocation des coûts par utilisateur sur des instances partagées, et la nécessité de former les chercheurs aux spécificités du cloud. L'épisode aborde aussi leur approche hybride permettant aux graphes de s'exécuter partiellement on-prem et sur AWS pendant la migration."
episode: 363
duration: "00:40:35"
size: 59857699
file: "363.mp3"
social-background: "363.png"
category: "podcasts"
guests:
  - name: "Julien Lafaye"
    link: https://www.linkedin.com/in/julien-lafaye-49a0125/
    title: "Directeur, CFM"
  - name: "Otmane El Ansary"
    link: https://www.linkedin.com/in/otmane-el-ansary/
    title: "Software Engineer, Associate, CFM"
publication: "2026-05-01 04:00:00 +0100"
author: "Sébastien Stormacq"
links:
- text: "Capital Fund Management (CFM)"
  link: https://www.cfm.com/
- text: "How CFM built a well-governed and scalable data-engineering platform using Amazon EMR for financial features generation"
  link: https://aws.amazon.com/blogs/big-data/how-cfm-built-a-well-governed-and-scalable-data-engineering-platform-using-amazon-emr-for-financial-features-generation/
- text: "AWS Summit Paris 2025 - Construire une plateforme de traitement de donnée innovante avec AWS (YouTube)"
  link: https://www.youtube.com/watch?v=kl6dxkrFzC8
- text: "Directed acyclic graph (Wikipedia)"
  link: https://en.wikipedia.org/wiki/Directed_acyclic_graph
- text: "Slurm Workload Manager - Documentation"
  link: https://slurm.schedmd.com/documentation.html
---
