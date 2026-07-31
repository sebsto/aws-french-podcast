# Méthodologie de mesure d'audience — IAB v2.2

## Résumé pour les parties prenantes

Ce document explique comment l'audience du podcast AWS en français est mesurée, pourquoi nous suivons la norme IAB v2.2, et pourquoi les chiffres seront significativement plus bas que d'autres méthodes de mesure.

## Ce que nous mesurons

| Métrique | Définition IAB v2.2 |
|----------|---------------------|
| **Download** | Une requête de fichier unique qui a été téléchargée. Inclut les téléchargements complets et partiels conformément aux règles de filtrage (Section 5, IAB v2.2) |
| **Auditeur unique** | Combinaison unique d'adresse IP + User-Agent dans une fenêtre de temps donnée (jour, semaine, mois) |

## Pourquoi nos chiffres sont plus bas

### 1. Filtrage strict des bots (IAB §5.4.2, Step 1.2)

Nous excluons :
- Les robots d'indexation connus (Googlebot, Bingbot, etc.)
- Les outils de monitoring (Pingdom, UptimeRobot, Datadog)
- Les bots d'analytics podcast (Chartable, Podsights, Podscribe)
- Les téléchargements Apple Watch dupliqués (UA `atc/` ou `(null)/(null) watchOS`)
- Les IPs générant plus de 1000 requêtes/jour (comportement non-humain)
- Les User-Agents vides ou malformés (< 5 caractères)

**Impact estimé** : -2 à -5% des requêtes brutes

### 2. Seuil minimum de contenu (IAB §5.4.3, Step 2)

Un téléchargement n'est comptabilisé que si au moins **1 minute de contenu audio** a été transférée (≈ 960 KB à 128 kbps). Cela élimine :
- Les pré-chargements avortés
- Les sondes de vérification (range requests de 2 octets)
- Les téléchargements interrompus avant toute écoute réelle

**Impact estimé** : -30 à -50% selon les plateformes. C'est le filtre le plus impactant.

### 3. Déduplication par fenêtre de 24h (IAB §5.4.4, Step 3)

Si le même auditeur (même IP + même UA) télécharge le même épisode plusieurs fois dans une journée UTC, un seul download est compté.

**Impact estimé** : -5 à -15%

### 4. Pas de comptage des requêtes HEAD ou 304

- Les requêtes HEAD (vérification sans transfert) sont exclues
- Les réponses 304 (fichier déjà en cache) sont exclues
- Seules les réponses 200 et 206 (contenu effectivement transféré) comptent

## Comparaison avec d'autres outils

| Outil | Méthodologie | Nos chiffres vs les leurs |
|-------|-------------|---------------------------|
| **OP3** | IAB-compliant (hashed IP, 24h UTC, bots exclus) | Comparable (±5%) |
| **Podtrac** | IAB-compliant (certifié) | Comparable (±5%) |
| **Apple Podcasts Analytics** | Écoute réelle (client-side) | Plus bas (mesure la lecture, pas le téléchargement) |
| **Spotify for Podcasters** | Streams (client-side) | Non comparable (modèle streaming) |
| **Statistiques serveur brutes** | Requêtes HTTP non filtrées | **40-60% plus bas** que les stats brutes |
| **Google Analytics / web** | Page views, sessions | Non applicable |

## Pourquoi suivre IAB v2.2 ?

1. **Standard de l'industrie** : utilisé par tous les acheteurs d'espace publicitaire podcast
2. **Comparabilité** : permet de se comparer aux autres podcasts certifiés IAB
3. **Confiance** : élimine le trafic artificiel qui gonfle les chiffres
4. **Transparence** : méthodologie documentée et reproductible

## Limitation connue : auditeurs uniques mensuels

Notre pipeline agrège les données par jour. Le nombre d'auditeurs uniques mensuels affiché sur le dashboard est la **somme des auditeurs uniques quotidiens**, ce qui sur-compte les auditeurs qui reviennent plusieurs jours dans le mois.

Pour obtenir un vrai décompte d'auditeurs uniques mensuels, il faudrait stocker les identifiants (IP+UA hashés) par mois — ce qui augmente la complexité et le stockage. Le chiffre actuel est un indicateur directionnel, pas un comptage exact.

## Source des données

- **Logs d'accès CloudFront** (first-party, sous notre contrôle)
- **Pas de dépendance** à un service tiers pour la mesure primaire
- **Validation parallèle** avec OP3.dev pendant 6 mois (Requirement 13)

## Références

- [IAB Podcast Measurement Technical Guidelines v2.2](https://iabtechlab.com/standards/podcast-measurement-guidelines/) (Mai 2024)
- [Programme de conformité IAB](https://iabtechlab.com/compliance-programs/podcast-measurement-compliance/)
