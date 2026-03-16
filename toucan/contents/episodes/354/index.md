---
title: "Aura Aero : 2000 coeurs pour concevoir un avion dans le cloud"
description: "Marc Germain, directeur digital, et Rémi Magnon, ingénieur CFD aérodynamique chez Aura Aero, partagent comment ils utilisent le cloud AWS pour concevoir leurs avions. Aura Aero est un constructeur aéronautique français qui développe l'Intégrale, un biplace de formation et de voltige, et ERA, un avion de transport régional hybride-électrique de dix-neuf places. La conception de ces avions repose sur des simulations numériques intensives, notamment en dynamique des fluides (CFD), qui nécessitent des clusters de calcul haute performance. Rémi explique comment les équations de Navier-Stokes sont résolues sur des milliers de cœurs en parallèle, avec des campagnes de calcul pouvant mobiliser jusqu'à deux mille cœurs physiques actifs pendant six à douze heures. L'équipe utilise la plateforme SOCA (Scale-Out Computing on AWS) pour orchestrer ces simulations, en choisissant dynamiquement les types d'instances EC2 adaptés à chaque besoin. Marc détaille les défis de disponibilité des instances face à la demande croissante liée à l'IA, les stratégies de gestion des coûts en on-demand, et l'archivage long terme des données de certification sur S3 Glacier, une obligation légale qui s'étend jusqu'à vingt ans après la destruction du dernier avion."
episode: 354
duration: "00:48:21"
size: 59794734
publication: "2026-03-20 04:00:00 +0100"
file: "354.mp3"
social-background: "354.png"
category: "podcasts"
guests:
  - name: "Rémi Magnon"
    link: https://www.linkedin.com/in/rmagnon/
    title: "Ingénieur CFD aérodynamique chez Aura Aero"
  - name: "Marc Germain"
    link: 
    title: "Directeur Digital chez Aura Aero"
author: "Sébastien Stormacq"
links:
- text: "Aura Aero - Constructeur aéronautique français"
  link: https://www.aura-aero.com/
- text: "ERA - Avion régional hybride-électrique 19 places"
  link: https://www.aura-aero.com/en/era
- text: "Guidance for Scale-Out Computing on AWS (SOCA)"
  link: https://aws.amazon.com/solutions/guidance/scale-out-computing-on-aws/
- text: "SOCA - Code source sur GitHub"
  link: https://github.com/awslabs/scale-out-computing-on-aws
- text: "Ansys Fluent - Logiciel de simulation CFD"
  link: https://www.ansys.com/products/fluids/ansys-fluent
- text: "Les equations de Navier–Stokes"
  link: https://en.wikipedia.org/wiki/Navier–Stokes_equations
---
