# Guide de Migration - Accessoires Tensift

## Étape 1 : Backup (sur l'ancien Hostinger)

1. Connecte-toi au Terminal SSH de l'ancien Hostinger
2. Va dans le dossier du projet :
```bash
cd /home/u910376272/public_html/tansift-accessoires
# ou le chemin exact de ton projet
```

3. Lance le script de backup :
```bash
bash migration/backup.sh
```

4. Le script crée un fichier `backup-TIMESTAMP.tar.gz` dans `/tmp/`
5. Télécharge ce fichier via FTP/File Manager (dans `/tmp/`)

## Étape 2 : Upload vers le nouveau Hostinger

1. Upload tout le projet via FTP/File Manager vers le nouveau compte
2. IMPORTANT : n'upload PAS le dossier `node_modules`

## Étape 3 : Deploy (sur le nouveau Hostinger)

1. Connecte-toi au Terminal SSH du nouveau Hostinger
2. Va dans le dossier du projet
3. Lance le script de deploy :
```bash
bash migration/deploy.sh
```

4. Le script te demandera les infos de la nouvelle base de données
5. Modifie le fichier `.env` avec les nouvelles credentials

## Étape 4 : Configurer le domaine

Dans hPanel du nouveau compte :
1. Va dans Domaines → Ajouter un domaine existant
2. Entre ton nom de domaine
3. Change les nameservers chez ton registrar vers ceux de Hostinger
4. Attends 24-48h pour la propagation DNS
