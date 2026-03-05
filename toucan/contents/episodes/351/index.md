---
title: "Club Med : sans serveur pour 3 milliards de requêtes / mois"
description: "Vous avez peut-être déjà réservé vos vacances sur clubmed.fr. Mais vous êtes-vous déjà demandé ce qui se passe derrière ce bouton 'Réserver' ? Jérémy Wallez, lead architecte au Club Med, nous emmène dans les coulisses techniques du site web B2C et raconte comment son équipe a repensé toute l'architecture, du on-premise vers une plateforme cloud capable d'encaisser 3 milliards de requêtes par mois et de servir 350 millions d'images. On découvre pourquoi l'équipe a adopté une architecture événementielle avec EventBridge, comment elle a trouvé le bon équilibre entre Lambda et ECS Fargate après avoir constaté que le full serverless n'était pas la réponse à tout, et pourquoi les cold starts de plusieurs secondes les ont poussés vers une approche hybride. Jérémy partage aussi les défis concrets : les pics de charge lors des passages télé, la gestion des quotas AWS en multi-comptes, et l'importance des métriques métier pour anticiper le scaling. Un retour d'expérience technique riche et honnête pour tous ceux qui s'intéressent à la modernisation d'architectures web à grande échelle."
episode: 351
duration: "00:42:59"
size: 56815437
publication: "2026-03-06 04:00:00 +0100"
file: "351.mp3"
social-background: "351.png"
category: "podcasts"
guests:
  - name: "Jérémy Wallez"
    link: https://clubmed.fr
    title: "Lead Architecte au Club Med"
author: "Sébastien Stormacq"
links:
- text: "Club Med"
  link: https://www.clubmed.fr/
- text: "AWS Lambda Web Adapter - Exécuter des applications web sur AWS Lambda"
  link: https://github.com/awslabs/aws-lambda-web-adapter
- text: "AWS Elemental MediaConvert - Service de traitement vidéo"
  link: https://docs.aws.amazon.com/mediaconvert/latest/ug/what-is.html
---
