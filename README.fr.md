<p align="center"><img src="docs/banner.gif" alt="Mona : le David de Michel-Ange en ASCII, balayé par une lumière" width="420"></p>

<h1 align="center">Mona</h1>

<p align="center"><b>Vois ton site comme le verrait un nouveau visiteur.</b><br>
Mona devine où les yeux se posent sur une page web et comment le cerveau réagit, vérifie la lisibilité et donne une note sur 100.<br>
Une petite application de bureau : les modèles d'IA tournent sur ton PC, rien n'est envoyé ailleurs.</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence : usage personnel" src="https://img.shields.io/badge/licence-usage%20personnel-d9b877"></a>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Plateformes" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
  <img alt="L'IA tourne sur ton PC" src="https://img.shields.io/badge/IA-tourne%20sur%20ton%20PC-9bc7a8">
  <img alt="Modèles ONNX inclus" src="https://img.shields.io/badge/mod%C3%A8les-ONNX%20inclus-005CED?logo=onnx&logoColor=white">
</p>

<p align="center"><a href="README.md">English</a> · <a href="https://mona.devliam.com/">Site</a> · <a href="https://mona.devliam.com/benchmarks.html">Mesures</a> · <a href="docs/MODELS.md">Modèles d'IA</a> · <a href="docs/ARCHITECTURE.md">Architecture</a> · <a href="TERMS.md">Conditions</a> · <a href="PRIVACY.md">Confidentialité</a></p>

<p align="center"><img src="docs/demo.gif" alt="Mona analyse une page web : animation en caractères, puis le rapport" width="720"></p>

## Ce que fait Mona

- **Prédiction du regard** : une carte de chaleur de ce que les gens regardent en premier, avec deux modèles d'IA appris sur de vrais regards (62 personnes, 1 980 interfaces).
- **Réaction du cerveau** : une estimation de la réponse de 20 zones visuelles du cortex (indicatif, appris sur des données d'IRM).
- **Note de lisibilité** : six vérifications (contraste du texte, taille du texte, bouton principal, hiérarchie visuelle, quantité de texte, surcharge) réunies en une note sur 100, avec des conseils pour chaque écran.
- **Détecteur d'éléments** : repère les textes, boutons, images, champs et icônes sur une capture, une maquette ou un export Figma.
- **Un vrai Chrome regarde la page** : colle une adresse, Mona ouvre un Chrome de test, fait défiler la page jusqu'en bas comme un visiteur, puis la lit. Ou dépose une image.
- **S'adapte à ton PC** : Mona lit ton processeur, ta mémoire et ta carte graphique, puis choisit à quel point travailler (et laisse un quart des cœurs libres).
- **Privé par conception** : pas de compte, pas de suivi. Le seul trafic réseau est la visite du site que tu analyses.

## Installer et lancer

Il faut Python 3.10 ou plus récent. [Télécharge le ZIP](https://github.com/LiamLitle/mona-local/archive/refs/heads/main.zip) (les modèles d'IA sont dedans) ou clone le dépôt, puis :

| | |
|---|---|
| **Windows** | double-clique sur **`Mona.bat`** |
| **macOS, Linux** | lance **`./mona.sh`** |

La première fois, tout s'installe tout seul (quelques minutes : paquets Python et Chrome de test, environ 150 Mo). Ensuite, l'application s'ouvre directement, dans sa propre fenêtre.

<details><summary>Ou à la main</summary>

```bash
pip install -r requirements.txt
python -m mona setup      # installe le Chrome de test, une seule fois
python -m mona            # ouvre l'application
```

Pour une fenêtre native au lieu d'une fenêtre Chrome/Edge en mode application : `pip install -r requirements-app.txt`.
</details>

## Commandes

```bash
python -m mona                      # ouvre l'application
python -m mona analyze https://exemple.com    # analyse sans interface
python -m mona analyze capture.png            # analyse une image
python -m mona doctor               # ton PC, les réglages choisis, l'état des modèles
python -m mona setup                # installe le Chrome de test
python -m mona serve                # serveur seul, sans fenêtre
python -m pytest                    # lance les tests
```

Variables d'environnement : `MONA_PORT`, `MONA_MAX_SCREENS` (12 par défaut), `MONA_HEADLESS=1` (cacher le Chrome de test), `MONA_HOME` (où sont gardés les réglages).

## Où est quoi ?

```
mona-local/
├── models/        ← LES MODÈLES D'IA (*.onnx) + MODELS.json  → docs/MODELS.md
├── mona/
│   ├── ai/        fait tourner les modèles : regard, cerveau, détecteur, plan B
│   ├── capture.py le Chrome de test : ouvrir, défiler, capturer
│   ├── rules.py   les six règles de lisibilité et la note
│   ├── pipeline.py, server.py, desktop.py, hardware.py
│   └── web/       l'interface
├── docs/          ARCHITECTURE.md, MODELS.md
├── tests/         tests automatiques
├── Mona.bat · mona.sh   lanceurs en un clic
└── LICENSE, TERMS.md, PRIVACY.md, NOTICE.md
```

- **Les modèles d'IA** sont dans [`models/`](models) et livrés avec le dépôt. [`docs/MODELS.md`](docs/MODELS.md) explique chacun : rôle, entrée et sortie, données d'entraînement, licences.
- **Comment les pièces s'assemblent** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Est-ce fiable ?

Mesuré sur des cas jamais vus à l'entraînement :

| Quoi | Résultat |
|---|---|
| Regard contre de vrais regards (UEyes) | corrélation 0,68 |
| Regard sur des pages web d'un autre jeu de données (Imp1k) | corrélation 0,56 |
| Détecteur d'éléments (texte, bouton, image) | F1 0,64 |
| Note depuis une image seule contre note depuis le code de la page | 5,5 points sur 100 d'écart en moyenne |

Le modèle du cerveau vient d'une seule personne : une indication, pas un diagnostic. Mona mesure la lisibilité et l'attention, **pas le goût**, et ne remplace ni un test avec de vraies personnes ni un audit d'accessibilité. Détails et méthode : <https://mona.devliam.com/benchmarks.html>.

## Questions fréquentes

**C'est gratuit ?** Oui, pour un usage personnel et non commercial. Voir la licence ci-dessous.

**Ça marche sur téléphone ?** Non, c'est une application de bureau (Windows, macOS, Linux).

**C'est rapide ?** Sur un PC récent, une image prend quelques secondes et une page une dizaine. `python -m mona doctor` montre ce que Mona a choisi pour ta machine.

**Je peux m'en servir pour des clients ou dans mon produit ?** Pas sans l'accord écrit de l'auteur. Voir [LICENSE](LICENSE).

**Où vont mes rapports ?** Nulle part : ils restent dans le stockage de l'application, sur ton PC. Tu peux les exporter en JSON ou les imprimer en PDF.

## Licence et cadre légal

**Mona Personal Use License** ([LICENSE](LICENSE), avec traduction française) : utilise-la pour toi, gratuitement. **Pas** de redistribution, **pas** de vente, **pas** d'usage pour gagner de l'argent (y compris travail pour des clients et services en ligne), **pas** d'entraînement d'autres modèles avec, et un **crédit visible** (« Mona par Liam Litle ») dès que tu montres ou publies quelque chose qui l'utilise. C'est du *source-available*, pas de l'open source. Pour tout autre usage, demande d'abord à l'auteur.

- [Conditions d'utilisation](TERMS.md) · [Politique de confidentialité](PRIVACY.md) · [Données et licences tierces](NOTICE.md)
- Les données d'entraînement et les poids préentraînés ont leurs propres conditions ; le modèle du cerveau dérive d'images réservées à la recherche et ne s'utilise qu'en recherche non commerciale.
- Pour citer Mona, utilise le bouton « Cite this repository » de GitHub ([CITATION.cff](CITATION.cff)).

<sub>Mots-clés : analyse de page web, saillance visuelle, prédiction du regard, carte de chaleur d'attention, audit UX, note de lisibilité, contraste WCAG, analyse de maquette Figma, détection d'éléments d'interface, ONNX, Playwright, application de bureau.</sub>
