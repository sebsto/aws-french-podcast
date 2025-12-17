---
title: "Comment échouer son architecture event-driven : 12 pièges à éviter"
description: "Dans cet épisode enregistré depuis la conférence API Days à Paris, nous explorons les architectures event-driven avec Hassane Moustapha, architecte IT et coach chez Bivwak! (BNP Paribas). Fort de son expérience dans le secteur bancaire, Hassane partage 12 risques majeurs qui peuvent compromettre vos systèmes basés sur les événements.

Nous commençons par définir ce qu'est réellement un système event-driven et comment il s'inscrit dans l'évolution des Enterprise Service Bus des années 2000. L'épisode couvre ensuite méthodiquement les principales sources d'échec : de la mauvaise typologie des événements au choix inadéquat des clés de partitionnement, en passant par la gestion des messages empoisonnés et les problèmes de consistance éventuelle.

Hassane détaille des aspects techniques cruciaux comme le pattern Outbox pour éviter les incohérences transactionnelles, la gestion de l'ordre des événements dans les systèmes distribués, et l'importance de l'idempotence. Nous abordons également les défis de sécurité spécifiques aux topic spaces, la nécessité d'un catalogue de gouvernance, et les bonnes pratiques d'observabilité avec OpenTelemetry.

L'épisode s'appuie sur des exemples concrets du monde bancaire, notamment la différence entre événements métiers et techniques, et explique pourquoi certains concepts comme \"exactly once semantic\" restent un mythe en production. Une discussion technique accessible qui transforme 12 anti-patterns en autant de bonnes pratiques pour réussir vos architectures distribuées."
episode: 338
duration: "00:53:10"
size: 81178155
file: "338.mp3"
social-background: "338.png"
category: "podcasts"
publication: "2026-01-02 04:00:00 +0100"
author: "Sébastien Stormacq"
guests:
- name: "Hassane Moustapha"
  link: https://www.linkedin.com/in/hassanemoustapha/
  title: "Architecte technique senior, Bivwak!"
links:
- text: "Apache Kafka"
  link: https://kafka.apache.org/
- text: "Amazon Kinesis Data Streams"
  link: https://docs.aws.amazon.com/streams/latest/dev/introduction.html
- text: "AWS Shuffle Sharding"
  link: https://aws.amazon.com/blogs/architecture/shuffle-sharding-massive-and-magical-fault-isolation/
- text: "Precision clock and time synchronization on your EC2 instance"
  link: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/set-time.html
---
