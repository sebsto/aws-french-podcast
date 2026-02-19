---
title: "Doctolib : 20k requêtes/sec sur Graviton et Karpenter"
description: "Bertrand Paquet, Principal Reliability Engineer chez Doctolib, partage le retour d'expérience de la double migration vers Graviton et Karpenter. Doctolib gère 80 millions de patients avec un monolithe Ruby on Rails servant 20 000 requêtes par seconde sur 1500 pods, dont 80% tournent sur des instances spot. La migration vers Graviton visait deux objectifs : réduire les coûts et diminuer le taux de reclaim des instances spot. L'équipe a adopté une approche pragmatique en utilisant d'abord la cross-compilation avec QEMU malgré les temps de build allongés, avant de migrer progressivement les workloads. La migration vers Karpenter a remplacé les 14-15 node groups gérés par cluster autoscaler, simplifiant considérablement les mises à jour de cluster EKS et améliorant la gestion des préemptions spot grâce au bin packing. Bertrand détaille les défis rencontrés, notamment la nécessité d'ajouter des pod disruption budgets sur toutes les applications, et partage ses recommandations : ne pas hésiter à migrer vers Graviton car c'est souvent un non-sujet technique, et adopter Karpenter dès le départ pour tout nouveau cluster EKS."
episode: 348
duration: "00:43:24"
size: 51672253 
publication: "2026-02-20 04:00:00 +0100"
file: "348.mp3"
social-background: "348.png"
category: "podcasts"
guests:
  - name: "Betrand Paquet"
    link: https://www.linkedin.com/in/bertrand-paquet-1824a03/
    title: "Principal SRE at Doctolib"
author: "Sébastien Stormacq"
links:
- text: "Doctolib"
  link: https://doctolib.fr/
- text: "Podcast : Doctolib, the boring architecture (en français)"
  link: https://podcasts.apple.com/fr/podcast/doctolib-et-la-boring-architecture-avec-david-gageot/id1503255739?i=1000539101470 
- text: "Podcast FR : Graviton"
  link: https://francais.podcast.go-aws.com/web/episodes/267/index.html
- text: "Karpenter"
  link: https://karpenter.sh/
---
