# NounouCalc

NounouCalc est un assistant local pour préparer les déclarations mensuelles Pajemploi de l’assistante maternelle de Noa.

## Ce que fait la nouvelle version

- calcule les jours d’activité mensualisés à partir du contrat ;
- sépare les heures normales mensualisées, complémentaires et majorées ;
- affiche la base exacte utilisée pour le salaire et la valeur entière à saisir ;
- détaille le salaire net, les indemnités d’entretien et les repas ;
- enregistre chaque déclaration mensuelle dans le navigateur ;
- conserve plusieurs simulations par mois et distingue clairement la simulation de la déclaration confirmée sur Pajemploi ;
- calcule automatiquement les congés acquis depuis la date de début du contrat, même si aucun mois antérieur n’a encore été enregistré ;
- déduit les congés déjà rémunérés dans les déclarations Pajemploi confirmées et solde d’abord les droits les plus anciens ;
- rappelle le mois et le mode de paiement des congés prévu au contrat ;
- exporte et importe une sauvegarde JSON complète ;
- protège les données à chaud (brouillon de mise à jour), à tiède (stockage immédiat) et à froid (IndexedDB avec 30 instantanés) ;
- prépare directement dans la déclaration du dernier mois la fin de contrat, les congés restant à payer, le préavis, la précarité, la rupture et la régularisation ;
- estime le CMG selon le barème 2026 et mémorise ensuite les montants réellement calculés par Pajemploi+ ;
- imprime un dossier employeur professionnel avec un mémo complet pour la saisie de l’attestation France Travail : identités, emploi, préavis, salaires bruts, temps non payé, absences, primes et sommes de rupture ;
- signale clairement les salaires bruts encore estimés ou les informations France Travail à compléter, tandis que les documents officiels restent produits par Pajemploi et France Travail ;
- s’installe comme PWA, fonctionne hors ligne et vérifie automatiquement les nouveaux builds ;
- propose un thème iOS sobre automatique, clair ou sombre.

L’application ne transmet aucune donnée. Elle fonctionne comme un site statique et peut être ouverte avec un petit serveur local ou publiée sur GitHub Pages.

## Utilisation

1. Ouvrir l’onglet **Contrat** et saisir les données contractuelles, notamment la date de début, le nombre de semaines, les jours et heures hebdomadaires ainsi que les taux net et brut.
2. Ouvrir **Mois**, choisir la période. Les jours réellement gardés et les repas sont préremplis avec les jours ouvrés prévus au contrat ; les corriger selon les présences réelles.
3. Cliquer sur **Enregistrer cette simulation**. Créer autant de variantes que nécessaire.
4. Pour le dernier mois, ouvrir **Fin de contrat ce mois**, choisir **Oui**, contrôler la date et les propositions automatiques, puis compléter les éventuels montants de préavis ou de régularisation.
5. Reporter les valeurs du bloc « Valeurs à reporter sur Pajemploi » et, le cas échéant, celles du bloc « Fin de contrat ».
6. Appuyer sur **Confirmer la saisie sur Pajemploi** uniquement pour la variante réellement déclarée. Une fenêtre demande une seconde confirmation explicite.
7. Après validation, recopier si possible le salaire brut, le CMG et le prélèvement Pajemploi+ officiels.
8. Exporter régulièrement la sauvegarde JSON depuis l’onglet **Données**.

Pour préparer une fin de contrat, renseigner aussi dans **Contrat** les coordonnées, dates de naissance, numéro de Sécurité sociale, nationalité et caisse de retraite. Pour chaque mois concerné, compléter les heures/jours non payés, l’éventuel arrêt ou suspension, la prime brute et le salaire brut officiel. Le dossier imprimé dans **Historique** rassemble alors les rubriques nécessaires à la saisie France Travail.

## Sauvegarde, restauration et mises à jour

Le stockage courant et IndexedDB contiennent le même état complet. IndexedDB conserve en plus les 30 derniers instantanés afin de mieux résister à une écriture interrompue. L’export JSON est portable et inclut tous les paramètres, l’administratif, la configuration CMG, les préférences, toutes les simulations et toutes les déclarations validées.

L’import recalcule systématiquement les résultats de chaque simulation à partir des données du contrat et des saisies mensuelles. Un jeu d’essai privé peut ainsi conserver séparément ses résultats attendus dans une section `referenceChecks`, sans maquiller les calculs ni publier les données personnelles de la famille.

Le service worker utilise une stratégie réseau prioritaire avec repli hors ligne. L’application compare le dernier commit de `main` au démarrage, au retour au premier plan et toutes les cinq minutes ; `build.json` sert de repli si l’API publique GitHub est temporairement indisponible. Si le code a changé, le brouillon courant est placé temporairement en mémoire de session, la PWA se recharge, puis le brouillon est restauré. Il n’est donc pas nécessaire de modifier le numéro de version officiel pour diffuser une correction.

L’interface est conçue en priorité pour iPhone 13/15 Pro et iPad. Le format ordinateur est secondaire.

## Lancer les tests

Node.js 20 ou plus récent :

```bash
node --test
```

## Limites importantes

NounouCalc est un outil d’aide et non un service de paie. Les absences, l’adaptation, les congés, la régularisation et la rupture peuvent dépendre de faits que le logiciel ne peut pas deviner. Le récapitulatif de l’Urssaf fait foi avant validation. Le dossier employeur n’est pas l’attestation France Travail officielle : celle-ci doit être générée et transmise via le service Pajemploi-France Travail, puis remise à la salariée.

Les règles et choix de calcul sont documentés dans [docs/REGLES_CALCUL.md](docs/REGLES_CALCUL.md).
