# NounouCalc

NounouCalc est un assistant local pour préparer les déclarations mensuelles Pajemploi de l’assistante maternelle de Noa.

## Ce que fait la nouvelle version

- calcule les jours d’activité mensualisés à partir du contrat ;
- sépare les heures normales mensualisées, complémentaires et majorées ;
- affiche la base exacte utilisée pour le salaire et la valeur entière à saisir ;
- détaille le salaire net, les indemnités d’entretien et les repas ;
- enregistre chaque déclaration mensuelle dans le navigateur ;
- conserve plusieurs simulations par mois et distingue clairement la simulation de la déclaration confirmée sur Pajemploi ;
- suit provisoirement les congés acquis par période du 1er juin au 31 mai ;
- rappelle le mois et le mode de paiement des congés prévu au contrat ;
- exporte et importe une sauvegarde JSON complète ;
- protège les données à chaud (brouillon de mise à jour), à tiède (stockage immédiat) et à froid (IndexedDB avec 30 instantanés) ;
- prépare une simulation de fin de contrat à partir de l’historique ;
- estime le CMG selon le barème 2026 et mémorise ensuite les montants réellement calculés par Pajemploi+ ;
- imprime un dossier employeur professionnel, tandis que le bulletin de salaire officiel reste produit par Pajemploi.
- s’installe comme PWA, fonctionne hors ligne et vérifie automatiquement les nouveaux builds ;
- propose un thème iOS sobre automatique, clair ou sombre.

L’application ne transmet aucune donnée. Elle fonctionne comme un site statique et peut être ouverte avec un petit serveur local ou publiée sur GitHub Pages.

## Utilisation

1. Ouvrir l’onglet **Contrat** et saisir les données contractuelles, notamment la date de début, le nombre de semaines, les jours et heures hebdomadaires ainsi que les taux net et brut.
2. Ouvrir **Déclaration**, choisir le mois et renseigner seulement les variables réelles du mois.
3. Cliquer sur **Enregistrer cette simulation**. Créer autant de variantes que nécessaire.
4. Reporter les six valeurs du bloc « Valeurs à reporter sur Pajemploi ».
5. Cocher « saisie et validée sur Pajemploi » uniquement pour la variante réellement déclarée.
6. Après validation, recopier si possible le salaire brut, le CMG et le prélèvement Pajemploi+ officiels.
7. Exporter régulièrement la sauvegarde JSON depuis l’onglet **Sauvegarde**.

## Sauvegarde, restauration et mises à jour

Le stockage courant et IndexedDB contiennent le même état complet. IndexedDB conserve en plus les 30 derniers instantanés afin de mieux résister à une écriture interrompue. L’export JSON est portable et inclut tous les paramètres, l’administratif, la configuration CMG, les préférences, toutes les simulations et toutes les déclarations validées.

Le service worker utilise une stratégie réseau prioritaire avec repli hors ligne. À chaque publication sur `main`, le workflow GitHub Pages écrit l’identifiant exact du commit dans `build.json`. L’application le contrôle au retour au premier plan et toutes les cinq minutes. Si le code a changé, le brouillon courant est placé temporairement en mémoire de session, la PWA se recharge, puis le brouillon est restauré. Il n’est donc pas nécessaire de modifier le numéro de version officiel pour diffuser une correction.

L’interface est conçue en priorité pour iPhone 13/15 Pro et iPad. Le format ordinateur est secondaire.

## Lancer les tests

Node.js 20 ou plus récent :

```bash
node --test
```

## Limites importantes

NounouCalc est un outil d’aide et non un service de paie. Les absences, l’adaptation, les congés, la régularisation et la rupture peuvent dépendre de faits que le logiciel ne peut pas deviner. Le récapitulatif de l’Urssaf fait foi avant validation.

Les règles et choix de calcul sont documentés dans [docs/REGLES_CALCUL.md](docs/REGLES_CALCUL.md).
