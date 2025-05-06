---
title: "Les coulisses de la data chez Voodoo"
description: "Cette semaine dans le podcast AWS en français, nous partons dans les coulisses de Voodoo, leader mondial des jeux mobiles, pour découvrir comment l’entreprise a transformé son infrastructure de données afin de répondre aux exigences de performance, de coûts et d’évolutivité.

De la collecte de données utilisateur à la diffusion de publicités via des enchères en temps réel, Voodoo s'appuie sur un système de données complexe, critique pour son activité. Mais lorsque la latence des dashboards et les coûts d'infrastructure ont explosé, il a fallu tout repenser.

Notre invité nous raconte comment ils ont migré leur data lake vers une architecture Lakehouse moderne, basée sur Apache Iceberg et Spark, hébergée sur Amazon S3. Ils partagent les raisons techniques et organisationnelles de cette décision, les bénéfices concrets (latence divisée par trois, coûts réduits de 20%) ainsi que les défis d'observabilité, de maintenance, et de gouvernance des données. L'épisode évoque aussi l’avenir de cette architecture, avec des outils comme Apache Quby ou des partenariats avec des startups spécialisées.

Un épisode riche en enseignements pour toute équipe confrontée à la croissance rapide de ses volumes de données et à la nécessité de concilier performance, coût et agilité."
episode: 296
duration: "00:45:05"
size: 54312870
file: "296.mp3"
social-background: "296.png"
category: "podcasts"
guests:
- "name": "Hussein Awala"
  "link": https://www.linkedin.com/in/husseinawala/
  "title": "Senior Data Engineer"
publication: "2025-05-09 04:00:00 +0100"
author: "Sébastien Stormacq"
links:
- text: "Voodoo"
  link: https://voodoo.io/
- text: "Voodoo Ads"
  link: https://voodoo.io/ads
- text: "Be Real"
  link: https://bereal.com/
- text: "Voodoo SDK Mobile"  
  link: https://voodoo.io/publishing
---

<!--
-20% de couts 
-30% de latence
-traiter 3x plus données qu'en 2024
-cluster spark : de 0 a 3000 CPU et 24Tb en moins de 2 minutes
-temps d'execution divisé par 10
-cout divisé par 3.5
-->