# Règles de calcul et décisions de conception

Mise à jour : 24 juillet 2026.

## 1. Mensualisation

La convention distingue :

- l’accueil sur **52 semaines** ;
- l’accueil sur **46 semaines ou moins**.

Le cas « 47 à 51 semaines » n’est donc pas proposé.

Formules utilisées :

```text
heures normales mensuelles exactes =
  heures normales hebdomadaires × semaines programmées ÷ 12

heures majorées contractuelles mensuelles exactes =
  heures majorées hebdomadaires × semaines programmées ÷ 12

jours mensualisés exacts =
  jours d’accueil hebdomadaires × semaines programmées ÷ 12
```

Le salaire est calculé avec les valeurs exactes non arrondies. L’écran présente séparément les nombres entiers destinés à la saisie Pajemploi.

## 2. Heures

- **Normales** : part contractuelle jusqu’à 45 heures par semaine.
- **Complémentaires** : heures demandées au-delà de la durée prévue au contrat, sans dépasser 45 heures sur la semaine concernée. Elles sont payées au taux de base, sauf majoration écrite au contrat.
- **Majorées** : heures effectuées au-delà de 45 heures par semaine. Le pourcentage est celui convenu au contrat.

Les heures majorées affichées pour le mois regroupent la part mensualisée prévue au contrat et les heures majorées supplémentaires saisies pour le mois.

## 3. Jours d’activité

Pour une garde mensualisée, le nombre de jours déclaré est le nombre de jours mensualisés, pas le nombre de présences réelles. Les présences réelles servent au calcul des indemnités.

Le nombre exact est arrondi à l’entier le plus proche pour la saisie, comme dans le modèle NounouTop fourni (19 jours mensualisés). Le nombre de jours réellement gardés reste saisi séparément et sert exclusivement aux indemnités d’entretien. Le nombre de jours avec repas est également distinct.

En cas d’absence non rémunérée, la déclaration peut demander des valeurs réelles spécifiques. NounouCalc laisse alors la déduction nette à saisir et affiche un avertissement ; une future version pourra intégrer le calcul conventionnel complet selon le planning.

## 4. Congés payés

La période de référence va du 1er juin au 31 mai. Le droit provisoire est suivi à raison de 2,5 jours ouvrables par période de quatre semaines d’accueil, dans la limite de 30 jours.

Le nombre acquis affiché en cours de période garde ses décimales. L’arrondi au jour entier supérieur n’est calculé qu’au bilan de période.

Lorsqu’une indemnité de congés payés est versée, son montant net est aussi converti en heures au taux normal et ajouté aux heures normales à déclarer :

```text
heures équivalentes de congés = montant net des congés ÷ taux horaire net normal
heures normales à déclarer = arrondi(heures normales mensualisées + heures équivalentes de congés)
```

Cette règle explique le passage de 165 heures normales en mai à 367 heures en juin dans les captures NounouTop transmises.

Chaque paiement est rattaché à la période pendant laquelle les droits ont été acquis. Ainsi, un paiement déclaré en juin règle normalement les droits de la période terminée le 31 mai ; il ne diminue pas les nouveaux droits acquis depuis le 1er juin.

Exemple de fin de contrat en août :

```text
droits restant après paiement de juin
+ droits acquis en juin
+ droits acquis en juillet
+ droits acquis jusqu'à la fin du contrat en août
= jours restant à indemniser à la rupture
```

La simulation de fin de contrat additionne les droits historisés et permet d’ajouter des semaines équivalentes non encore enregistrées. Le montant de l’indemnité compensatrice reste calculé par comparaison du maintien de salaire et du dixième ; il est donc saisi séparément.

Pour un accueil sur 46 semaines ou moins, le montant est calculé au 31 mai par comparaison entre :

- le maintien de salaire ;
- le dixième de la rémunération brute de la période.

Le plus favorable doit être retenu. Ce montant n’est pas automatiquement inventé par l’application : l’utilisateur le saisit après son calcul ou sa vérification. Le paiement mensuel par douzième n’est pas proposé.

## 5. Fin de contrat

Pour un CDI rompu par retrait de l’enfant, l’indemnité de rupture est calculée à partir de neuf mois d’ancienneté :

```text
total des salaires bruts historisés ÷ 80
```

Les indemnités d’entretien et de repas sont exclues. Un salaire brut officiel saisi après chaque déclaration est prioritaire ; sinon l’estimation issue du taux brut contractuel est utilisée.

Pour une fin de CDD, l’outil affiche 10 % de la rémunération brute historisée. Les cas d’exclusion restent à vérifier.

En accueil sur 46 semaines ou moins, la régularisation compare le salaire dû au réel et les mensualisations déjà versées. Seule une différence favorable à la salariée est ajoutée.

L’indemnité compensatrice de congés payés et le dernier salaire sont saisis séparément, car ils dépendent du planning et des droits réellement restants.

## 6. Sources officielles

- Urssaf, « Comment déclarer avec le service Pajemploi ? »  
  https://www.urssaf.fr/accueil/services/services-particuliers/service-pajemploi/declarer-service-pajemploi.html
- Convention collective IDCC 3239, articles 96, 102, 108 à 111 et 123  
  https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000043941642/
- Service-Public, « Congés payés d’une assistante maternelle »  
  https://www.service-public.fr/particuliers/vosdroits/F31655
- Service-Public, « Rupture du contrat de travail d’une assistante maternelle »  
  https://www.service-public.fr/particuliers/vosdroits/F16842

## 6 bis. Simulations, validation et CMG

Un mois peut contenir plusieurs simulations. Elles ne participent ni au compteur officiel de congés ni à la fin de contrat. Une seule simulation peut être marquée « validée sur Pajemploi » ; elle devient alors la mémoire officielle du mois dans NounouCalc.

Le bulletin de salaire est produit par l’Urssaf service Pajemploi. NounouCalc génère à la place un dossier employeur récapitulatif des données du contrat et des seules déclarations confirmées.

Pour 2026, l’estimation du CMG utilise :

- les ressources annuelles CAF N−2, divisées par douze et bornées entre 814,02 € et 8 500 € ;
- le nombre d’enfants à charge ;
- le taux d’effort correspondant ;
- le coût net de la garde, incluant salaire, entretien et repas ;
- le tarif horaire de référence de 4,91 € ;
- le plafond horaire assistant maternel de 8,09 €.

Le montant officiel calculé par Pajemploi+ peut être enregistré après validation et remplace alors l’estimation dans le dossier employeur.

Sources complémentaires :

- Urssaf, « Évolution du CMG »  
  https://www.urssaf.fr/accueil/actualites/evolution-cmg-ce-qui-va-changer.html
- Instruction interministérielle DSS/2B/2026/46 du 20 mars 2026  
  https://bulletins-officiels.social.gouv.fr/sites/textes-officiels/files/2026-03/SFHS2607952J.pdf

## 7. Points à comparer avec NounouTop

Les captures utiles sont :

1. paramètres complets du contrat ;
2. détail d’une déclaration mensuelle normale ;
3. détail d’un mois avec heures complémentaires ou majorées ;
4. compteur et paiement des congés de juin ;
5. simulation ou solde de fin de contrat ;
6. bulletin Pajemploi correspondant, en masquant les informations sensibles.

Ces références permettront une comparaison champ par champ et l’ajout des cas encore absents : adaptation, absences détaillées, jours fériés, planning réel et régularisation automatisée.

## 8. Mémoire locale et PWA

L’état métier est unique et versionné. Il comprend les données administratives, le contrat, le profil CMG, la préférence de thème, toutes les simulations mensuelles, l’identifiant de la simulation réellement validée sur Pajemploi, les congés associés à leur période d’acquisition et les montants officiels recopiés après déclaration.

Il est écrit simultanément :

1. dans le stockage local du navigateur pour un démarrage immédiat ;
2. dans IndexedDB comme copie à froid, avec au maximum 30 instantanés ;
3. dans un fichier JSON complet à la demande de l’utilisateur.

Le cache du service worker ne contient que le code de l’application, jamais la base métier. Avant une actualisation automatique du code, le formulaire en cours est conservé dans la mémoire de session puis restauré après rechargement.
