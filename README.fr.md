<p align="center"><img src="docs/banner.gif" alt="Mona : le David de Michel-Ange en ASCII, balayé par une lumière" width="420"></p>

<h1 align="center">Mona</h1>

<p align="center"><b>Vois ton site comme le verrait un nouveau visiteur.</b><br>
Mona devine où les yeux se posent sur une page web et comment le cerveau réagit, vérifie la lisibilité et donne une note sur 100. Tout tourne sur ton ordinateur.</p>

<p align="center">
  <a href="LICENSE"><img alt="Licence : usage personnel" src="https://img.shields.io/badge/licence-usage%20personnel-d9b877"></a>
  <img alt="Python 3.10+" src="https://img.shields.io/badge/python-3.10%2B-3776AB?logo=python&logoColor=white">
  <img alt="Plateformes" src="https://img.shields.io/badge/Windows%20%C2%B7%20macOS%20%C2%B7%20Linux-lightgrey">
  <img alt="100 % local" src="https://img.shields.io/badge/tourne-100%25%20en%20local-9bc7a8">
  <img alt="Modèles ONNX" src="https://img.shields.io/badge/mod%C3%A8les-ONNX-005CED?logo=onnx&logoColor=white">
</p>

<p align="center"><a href="README.md">English</a> · <a href="https://mona.devliam.com/">Site</a> · <a href="https://mona.devliam.com/benchmarks.html">Mesures</a> · <a href="TERMS.md">Conditions</a> · <a href="PRIVACY.md">Confidentialité</a></p>

<p align="center"><img src="docs/demo.gif" alt="Mona analyse une page web : animation en caractères, puis le rapport" width="720"></p>

## Ce que fait Mona

- **Prédiction du regard** : une carte de chaleur de ce que les gens regardent en premier, avec deux modèles d’IA appris sur de vrais regards (62 personnes, 1 980 interfaces).
- **Réaction du cerveau** : une estimation de la réponse de 20 zones visuelles du cortex (indicatif, appris sur des données d’IRM).
- **Note de lisibilité** : six vérifications (contraste du texte, taille du texte, bouton principal, hiérarchie visuelle, quantité de texte, surcharge) réunies en une note sur 100, avec des conseils pour chaque écran.
- **Détecteur d’éléments** : repère les textes, boutons, images, champs et icônes sur une capture, une maquette ou un export Figma.
- **Trois façons de l’utiliser** : colle une adresse (Mona l’ouvre dans un vrai Chrome et la fait défiler), dépose une image, ou analyse un onglet déjà ouvert.
- **Privé par conception** : pas de compte, pas de suivi, rien ne quitte ton ordinateur à part la visite du site que tu analyses. Les rapports restent dans ton navigateur.

## Démarrage rapide

Il faut Python 3.10 ou plus récent.

```bash
git clone https://github.com/LiamLitle/mona-local.git
cd mona-local
pip install -r requirements.txt
playwright install chromium
python server/app.py
```

Pas de git ? Utilise **Code, Download ZIP** en haut de la page du dépôt. Ton navigateur s’ouvre sur `http://127.0.0.1:8765` : tape une adresse et clique sur **Analyser**. La première fois, les modèles (environ 60 Mo) se chargent, puis restent en cache.

| Option | Comment |
|---|---|
| Autre port | `MONA_PORT=9000 python server/app.py` |
| Moins ou plus d’écrans | `MONA_MAX_SCREENS=6` (12 par défaut) |
| Ne pas ouvrir le navigateur tout seul | `MONA_NO_BROWSER=1` |

### Ligne de commande

```bash
pip install -r cli/requirements.txt
python cli/mona_cli.py capture.png
```

Écrit une carte de chaleur, les éléments détectés et le profil du cerveau dans `mona_out/`.

## Contenu du dépôt

| Dossier | Contenu |
|---|---|
| `web/` | L’interface de Mona et les modèles dans `web/models/` (regard ×2, cerveau, détecteur d’éléments) |
| `server/` | Petit serveur local : ouvre les adresses avec Playwright et sert `web/`. N’écoute que sur `127.0.0.1` et refuse les requêtes venant d’autres pages web |
| `cli/` | `mona_cli.py` : ligne de commande sur une image |
| `docs/` | Images de ce README |

## Est-ce fiable ?

Mesuré sur des cas jamais vus à l’entraînement :

| Quoi | Résultat |
|---|---|
| Regard contre de vrais regards (UEyes) | corrélation 0,68 |
| Regard sur des pages web d’un autre jeu de données (Imp1k) | corrélation 0,56 |
| Détecteur d’éléments (texte, bouton, image) | F1 0,64 |
| Note depuis une image seule contre note depuis le code de la page | 5,5 points sur 100 d’écart en moyenne |

Le modèle du cerveau vient d’une seule personne : une indication, pas un diagnostic. Mona mesure la lisibilité et l’attention, **pas le goût**, et ne remplace ni un test avec de vraies personnes ni un audit d’accessibilité. Détails et méthode : <https://mona.devliam.com/benchmarks.html>.

## Questions fréquentes

**C’est gratuit ?** Oui, pour un usage personnel et non commercial. Voir la licence ci-dessous.

**Ça marche sur téléphone ?** Non. Les modèles sont lourds (environ 60 Mo) et un téléphone ne sait pas enregistrer un autre onglet. Utilise un ordinateur.

**Je peux m’en servir pour des clients ou dans mon produit ?** Pas sans l’accord écrit de l’auteur. Voir [LICENSE](LICENSE).

**Où vont mes rapports ?** Nulle part : ils restent dans le stockage de ton navigateur. Tu peux les exporter en JSON ou les imprimer en PDF.

## Licence et cadre légal

**Mona Personal Use License** ([LICENSE](LICENSE), avec traduction française) : utilise-la pour toi, gratuitement. **Pas** de redistribution, **pas** de vente, **pas** d’usage pour gagner de l’argent (y compris travail pour des clients et services en ligne), **pas** d’entraînement d’autres modèles avec, et un **crédit visible** (« Mona par Liam Litle ») dès que tu montres ou publies quelque chose qui l’utilise. C’est du *source-available*, pas de l’open source. Pour tout autre usage, demande d’abord à l’auteur.

- [Conditions d’utilisation](TERMS.md) · [Politique de confidentialité](PRIVACY.md) · [Données et licences tierces](NOTICE.md)
- Les données d’entraînement et les poids préentraînés ont leurs propres conditions ; le modèle du cerveau dérive d’images réservées à la recherche et ne s’utilise qu’en recherche non commerciale.
- Pour citer Mona, utilise le bouton « Cite this repository » de GitHub ([CITATION.cff](CITATION.cff)).

<sub>Mots-clés : analyse de page web, saillance visuelle, prédiction du regard, carte de chaleur d’attention, audit UX, note de lisibilité, contraste WCAG, analyse de maquette Figma, détection d’éléments d’interface, ONNX, Playwright.</sub>
