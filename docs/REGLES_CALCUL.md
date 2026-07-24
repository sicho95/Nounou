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

Lors de la création d’un mois, NounouCalc propose par défaut les jours d’accueil programmés qui tombent du lundi au vendredi dans la période sélectionnée. Pour un contrat de cinq jours, juillet 2026 propose donc 23 jours, ou 18 jours si le contrat se termine le 24 juillet. Cette proposition doit être corrigée selon les présences réelles ; elle ne remplace pas le calendrier de garde.

En cas d’absence non rémunérée, la déclaration peut demander des valeurs réelles spécifiques. NounouCalc laisse alors la déduction nette à saisir et affiche un avertissement ; une future version pourra intégrer le calcul conventionnel complet selon le planning.

## 4. Congés payés

La période de référence va du 1er juin au 31 mai. Pour une année complète de 52 semaines, 2,5 jours ouvrables sont acquis par mois de travail effectif. Pour un accueil sur 46 semaines ou moins, l’acquisition est calculée par tranches ou équivalents de quatre semaines. Les droits annuels sont plafonnés à 30 jours.

Le compteur est reconstruit automatiquement depuis la date de début du contrat, y compris lorsqu’aucune déclaration antérieure n’existe dans l’application. Pour les mois enregistrés d’un accueil sur 46 semaines ou moins, les semaines équivalentes sont obtenues en divisant les jours d’accueil réels par les jours d’accueil hebdomadaires : 22 jours sur 5 jours par semaine donnent 4,4 semaines, donc 2,75 jours acquis, comme dans la capture NounouTop de juin 2026. Les mois anciens absents de l’historique sont projetés en répartissant les semaines contractuelles sur douze mois. Un premier ou dernier mois incomplet est proratisé. Si une absence assimilée ou un planning particulier rend les jours réels insuffisants pour représenter l’acquisition, le champ « Ajustement des semaines équivalentes » corrige uniquement le mois concerné.

Le nombre acquis affiché en cours de période garde ses décimales. L’arrondi au jour entier supérieur est appliqué au bilan d’une période de référence clôturée. Les éventuels jours supplémentaires pour enfant à charge de moins de 15 ans sont ajoutés à ce bilan, sans pouvoir dépasser 30 jours au total.

Lorsqu’une indemnité de congés payés est versée, son montant net est aussi converti en heures au taux normal et ajouté aux heures normales à déclarer :

```text
heures équivalentes de congés = montant net des congés ÷ taux horaire net normal
heures normales à déclarer = arrondi(heures normales mensualisées + heures équivalentes de congés)
```

Cette règle explique le passage de 165 heures normales en mai à 367 heures en juin dans les captures NounouTop transmises.

Chaque paiement ordinaire est rattaché à la période pendant laquelle les droits ont été acquis. Ainsi, un paiement déclaré en juin règle normalement les droits de la période terminée le 31 mai ; il ne diminue pas les nouveaux droits acquis depuis le 1er juin. Lors d’une fin de contrat, les jours soldés sont affectés automatiquement aux droits impayés les plus anciens, puis à la période en cours.

Exemple de fin de contrat en août :

```text
droits restant après paiement de juin
+ droits acquis en juin
+ droits acquis en juillet
+ droits acquis jusqu'à la fin du contrat en août
= jours restant à indemniser à la rupture
```

La simulation de fin de contrat additionne automatiquement les droits acquis jusqu’à la date de fin et déduit les jours déjà payés dans les seules déclarations Pajemploi confirmées. Elle propose l’indemnité compensatrice la plus favorable entre le maintien de salaire et le dixième. La proposition reste modifiable avant enregistrement.

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

La fin de contrat est intégrée à la déclaration du dernier mois. Les champs proposés correspondent à la rubrique Pajemploi : date et motif de fin, prime de précarité, indemnité compensatrice de congés payés et jours soldés, indemnité compensatrice de préavis, indemnité de rupture et régularisation de salaire.

L’indemnité compensatrice de congés, le préavis, la précarité et la régularisation sont ajoutés au salaire net déclaré. L’indemnité de rupture est ajoutée au total à verser mais reste isolée dans le récapitulatif. La proposition automatique utilise les déclarations confirmées ; les mois manquants sont estimés à partir de la mensualisation contractuelle et sont signalés.

## 6. Sources officielles

- Urssaf, « Comment déclarer avec le service Pajemploi ? »  
  https://www.urssaf.fr/accueil/services/services-particuliers/service-pajemploi/declarer-service-pajemploi.html
- Convention collective IDCC 3239, articles 96, 102, 108 à 111 et 123  
  https://www.legifrance.gouv.fr/conv_coll/id/KALITEXT000043941642/
- Service-Public, « Congés payés d’une assistante maternelle »  
  https://www.service-public.fr/particuliers/vosdroits/F31655
- Service-Public, « Rupture du contrat de travail d’une assistante maternelle »  
  https://www.service-public.fr/particuliers/vosdroits/F16842
- Urssaf, « Déclarer la fin du contrat de travail »
  https://www.urssaf.fr/accueil/particulier/particulier-employeur/gerer-la-fin-du-contrat-de-trava/declarer-fin-contrat.html
- Urssaf service Pajemploi, « Déclarer une fin de contrat »
  https://www.urssaf.fr/accueil/services/services-particuliers/service-pajemploi/declarer-fin-contrat-pajemploi.html
- Urssaf service Pajemploi, « Simuler une fin de contrat »
  https://www.urssaf.fr/accueil/services/services-particuliers/service-pajemploi/simulation-fin-contrat-pajemploi.html

## 6 bis. Simulations, validation et CMG

Un mois peut contenir plusieurs simulations. Elles ne participent ni au compteur officiel de congés ni à la fin de contrat. Une seule simulation peut être confirmée comme réellement saisie sur Pajemploi ; elle devient alors la mémoire officielle du mois dans NounouCalc. Cette confirmation est un bouton distinct du bouton d’enregistrement et demande une validation explicite.

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

Ces références permettront une comparaison champ par champ et l’ajout des cas encore absents : adaptation, absences détaillées, jours fériés et planning réel.

## 8. Mémoire locale et PWA

L’état métier est unique et versionné. Il comprend les données administratives, le contrat, le profil CMG, la préférence de thème, toutes les simulations mensuelles, l’identifiant de la simulation réellement validée sur Pajemploi, les congés associés à leur période d’acquisition et les montants officiels recopiés après déclaration.

Il est écrit simultanément :

1. dans le stockage local du navigateur pour un démarrage immédiat ;
2. dans IndexedDB comme copie à froid, avec au maximum 30 instantanés ;
3. dans un fichier JSON complet à la demande de l’utilisateur.

Le cache du service worker ne contient que le code de l’application, jamais la base métier. Le dernier commit de la branche `main` est utilisé comme identifiant technique de mise à jour, avec `build.json` en solution de repli. Avant une actualisation automatique du code, le formulaire en cours est conservé dans la mémoire de session puis restauré après rechargement.
