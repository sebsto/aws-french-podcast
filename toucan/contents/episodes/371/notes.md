# Notes de préparation - Épisode 371

Contexte : la plupart de ces annonces viennent de l'AWS Summit New York 2026 (17 juin).

---

## 1. Stockage & données - S3 évolue encore

### S3 Annotations

**Contexte** : Jusqu'ici, les métadonnées sur les objets S3 étaient limitées (tags = 10 paires clé/valeur, user metadata = 2 Ko). Les équipes qui avaient besoin de contexte riche (transcriptions IA, labels, specs techniques) devaient maintenir des bases de données séparées, synchronisées manuellement.

**Ce qu'il faut retenir** :
- On peut désormais attacher jusqu'à 1 Go de contexte structuré par objet (JSON, XML, YAML, texte)
- Jusqu'à 1 000 annotations nommées par objet, chacune jusqu'à 1 Mo
- Les annotations sont mutables — on peut les modifier sans réécrire l'objet
- Elles suivent l'objet automatiquement lors des copies, réplications cross-region
- Elles sont supprimées quand l'objet est supprimé (pas d'orphelins)
- Interrogeables directement via Athena, sans frais de récupération quel que soit le storage class
- Cas d'usage typique : agents IA qui ont besoin de découvrir, comprendre et agir sur les données à grande échelle sans maintenir un système de métadonnées séparé

### S3 Vectors - Baisse de prix et augmentation des limites

**Contexte** : S3 Vectors (GA depuis fin 2025) est le premier object store cloud avec support natif du stockage et de la recherche vectorielle. Il réduit les coûts jusqu'à 90% par rapport aux bases vectorielles spécialisées. Cette semaine, deux améliorations.

**Ce qu'il faut retenir** :
- Réduction de 80% des frais de requête pour les index volumineux — rend les gros datasets vectoriels plus économiques
- Support de jusqu'à 10 000 résultats de recherche par similarité par requête (avant : 100 max en GA)
- Toujours intégré nativement avec Bedrock Knowledge Bases pour le RAG
- Latence sub-seconde pour les requêtes peu fréquentes, ~100 ms pour les requêtes fréquentes

---

## 2. IA Générative & Agents - Bedrock s'enrichit

### Bedrock Managed Knowledge Base (GA)

**Contexte** : Bedrock Knowledge Bases existe depuis fin 2023, mais jusqu'ici c'était une approche "composants à assembler" : le développeur devait choisir sa base vectorielle (OpenSearch Serverless, Aurora PostgreSQL, Pinecone...), son modèle d'embedding, sa stratégie de chunking, configurer les data sources, et gérer la synchronisation. Ça restait du RAG semi-managé avec beaucoup de décisions d'architecture à prendre.

**Ce qui change avec Managed Knowledge Base** :
- C'est une nouvelle option "zero-config" à côté de l'option custom qui existe toujours
- Plus de base vectorielle à choisir ni à provisionner — le stockage vectoriel est intégré et optimisé automatiquement pour le rapport coût/performance
- 6 connecteurs natifs intégrés : S3, SharePoint, Confluence, Google Drive, OneDrive, Web Crawler — avec sync automatique
- Smart Parsing : nouveau — gère automatiquement les documents multi-format (PDF avec tables, images, structures complexes) sans configuration manuelle de parsing
- Defaults optimisés pour les embeddings, le re-ranking, et les modèles de fondation — plus de choix à faire
- Agentic Retriever : nouveau — décompose les requêtes complexes multi-étapes automatiquement (avant, le retrieval était en un seul passage)
- Intégré directement avec AgentCore Gateway

**En résumé** : avant on avait un workflow managé avec des composants à choisir soi-même. Maintenant c'est un service RAG entièrement opinionné où on pointe ses sources de données et ça fonctionne. L'option custom reste disponible pour ceux qui veulent contrôler chaque paramètre.

### Web Search sur Bedrock AgentCore

**Contexte** : Les agents IA ont souvent besoin d'informations à jour du web, mais ajouter la recherche web manuellement dans un agent est complexe (infrastructure, parsing, citations). AgentCore propose maintenant ça en natif.

**Ce qu'il faut retenir** :
- Outil de recherche web entièrement managé pour les agents Bedrock
- Compatible MCP — c'est un managed connector qu'on branche sur l'AgentCore Gateway
- Les agents peuvent ancrer leurs réponses dans des connaissances web actuelles et citées
- Zéro exfiltration de données (zero data egress) hors de l'environnement AWS sécurisé du client
- Plus besoin de gérer l'infrastructure de recherche web soi-même

---

## 3. Sécurité & Gouvernance

### AWS WAF - Monétisation du trafic IA

**Contexte** : Les bots IA (crawlers pour l'entraînement, agents) consomment du contenu web à grande échelle. Les éditeurs n'avaient pas de moyen simple de facturer cet accès. C'était soit bloquer, soit laisser passer gratuitement. On avait parlé du protocole x402 et des paiements par les agents IA dans l'épisode 364 (AgentCore Payments avec Coinbase et Stripe) — ici c'est l'autre côté de la médaille : le côté éditeur/propriétaire de contenu qui reçoit le paiement.

**Ce qu'il faut retenir** :
- Nouvelle capacité dans AWS WAF Bot Control
- Les propriétaires de contenu peuvent facturer les bots IA pour l'accès au contenu, directement au edge
- Tarification configurable par contenu, tarifs différenciés par identité de bot
- Vérification du paiement au edge — avant même que le contenu soit servi
- Utilise le protocole x402 pour les paiements
- Intégration avec Stripe pour la collecte des paiements
- Disponible sans surcoût WAF additionnel
- Transforme le trafic bot d'un centre de coûts en source de revenus

### AWS Security Agent - Threat Modeling et intégrations IDE

**Contexte** : La sécurité shift-left est un objectif, mais en pratique les développeurs ne font pas de threat modeling avant de coder. AWS Security Agent automatise ça.

**Ce qu'il faut retenir** :
- Threat modeling basé sur STRIDE — analyse les documents de design ou le code source
- Comprend l'architecture complète de l'application et identifie les menaces avec des mitigations recommandées
- Scanning complet de repos et de PRs avec remédiation, sur les principales plateformes Git
- Intégrations IDE : Kiro power, plugin Claude Code, et intégration MCP ouverte
- Les développeurs peuvent faire des code reviews de sécurité, générer des threat models, et remédier les findings sans quitter leur IDE
- Les équipes sécurité peuvent l'utiliser pour des évaluations pré-déploiement

---

## 4. Outils développeurs

### AWS DevOps Agent - Release Management (Preview)

**Contexte** : Le passage en production reste un moment stressant. Vérifier les dépendances, la conformité aux standards, les tests fonctionnels — c'est souvent manuel et sujet à erreur.

**Ce qu'il faut retenir** :
- Nouvelle capacité de gestion des releases (preview)
- Évalue chaque changement de code contre les exigences de production, la sûreté des dépendances, et les standards fournis
- Exécute des tests de release autonomes dans un environnement de vérification managé par AWS
- Vérifie que le logiciel build et fonctionne comme attendu avant la prod
- Vérifie l'adhérence aux standards, les impacts de dépendances, et les contrôles d'accès
- L'agent couvre maintenant delivery ET opérations

### AWS Blocks (Preview)

**Contexte** : Les développeurs frontend qui veulent un backend sur AWS doivent souvent apprendre CDK, CloudFormation, ou des outils d'infrastructure. AWS Blocks supprime cette barrière.

**Ce qu'il faut retenir** :
- Framework TypeScript open-source pour construire des backends sur AWS
- Approche local-first : on développe avec base de données, auth, et temps-réel en local sans compte AWS
- APIs type-safe avec mise à jour automatique des types côté frontend
- Pas besoin d'apprendre des outils d'infrastructure
- Inclut des steering files pour guider les agents IA dans la génération de code
- En preview publique

---

## 5. Brèves - Modèles sur Bedrock

### Gemma 4 et Grok disponibles sur Amazon Bedrock

- Gemma 4 (Google) et Grok (xAI) sont désormais accessibles via Amazon Bedrock
- Rien à configurer, disponibles via la même API unifiée que les autres modèles
- Élargit le choix de modèles pour les développeurs sur Bedrock

---

## 6. Productivité - Amazon Quick

**Contexte** : Amazon Quick est l'assistant IA de travail qui se connecte aux applications métier (Slack, Teams, CRM, bases de données). Cette semaine il gagne en autonomie.

**Ce qu'il faut retenir** :
- Agents autonomes : Quick peut maintenant gérer des tâches récurrentes en arrière-plan (suivi de deals bloqués, alertes sur changements réglementaires, etc.)
- Les utilisateurs peuvent créer leurs propres agents en langage naturel
- Analytics multi-datasets : analyse unifiée sur plusieurs sources de données
- Nouveau feed d'activité redessiné
- Nouveaux connecteurs : Adobe, Figma, WhatsApp, et d'autres
- Toujours basé sur le principe : connecter les apps, apprendre les workflows, agir de manière autonome

---

## Ordre de présentation suggéré

1. **Intro** : semaine du Summit NYC, beaucoup d'annonces
2. **S3 Annotations** — concret, facile à comprendre, impactant pour le stockage
3. **S3 Vectors** (prix + limites) — enchaînement naturel sur S3
4. **Bedrock Managed Knowledge Base** — transition vers l'IA
5. **Web Search AgentCore** — reste dans l'écosystème agents/Bedrock
6. **WAF AI Monetization** — sujet original, angle business
7. **Security Agent** — sécurité shift-left, intégrations IDE
8. **DevOps Agent** — complète le thème outils dev
9. **AWS Blocks** — pour les devs, ferme sur une note accessible
10. **Amazon Quick** — rapide en fin d'épisode, productivité
