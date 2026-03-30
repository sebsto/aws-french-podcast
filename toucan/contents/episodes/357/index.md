---
title: "RunsOn : faites tourner vos GitHub Actions dans votre compte AWS"
description: "Cyril Rohr a créé RunsOn pour résoudre un problème qu'il rencontrait régulièrement en mission : des pipelines CI/CD de plus en plus lents et coûteux sur GitHub Actions. Sa solution permet d'exécuter les GitHub Actions directement dans votre compte AWS, sur des instances EC2 éphémères. Dans cet épisode, Cyril explique l'architecture de RunsOn : un orchestrateur déployé sur AWS App Runner qui écoute les webhooks GitHub et lance des instances EC2 à la demande via l'API Fleet pour optimiser disponibilité et coût. Il détaille les défis techniques rencontrés, notamment la gestion des rate limits côté GitHub et AWS, l'optimisation des temps de démarrage des instances à environ 20 secondes, et la mise en place d'un cache transparent sur S3 qui intercepte les appels au cache GitHub natif. L'épisode aborde aussi les choix techniques comme la réécriture de l'orchestrateur de Node vers Go, le support du spot pricing, et l'intégration avec Open Telemetry pour l'observabilité. Cyril partage également des chiffres concrets : jusqu'à 80 000 jobs par jour chez certains clients et 1,4 million de jobs exécutés sur une seule journée tous clients confondus."
episode: 357
duration: "00:43:36"
size: 64412236
publication: "2026-04-03 04:00:00 +0100"
file: "357.mp3"
social-background: "357.png"
category: "podcasts"
guests:
  - name: "Cyril Rohr"
    link: https://www.linkedin.com/in/cyrilrohr/
    title: "Fondateur, RunsOn"
author: "Sébastien Stormacq"
links:
- text: "RunsOn - Runners GitHub Actions auto-hébergés sur AWS"
  link: https://runs-on.com/
- text: "RunsOn - Code source sur GitHub"
  link: https://github.com/runs-on/runs-on
---
