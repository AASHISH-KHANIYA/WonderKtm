# Creating the source ZIP

```bash
npm run package                        # writes wonderktm-ecommerce-source.zip into the project root
node scripts/package-zip.mjs ./out     # or choose a folder
```

The script copies the project to a temporary folder, **skipping** `node_modules`, `dist`, real `.env` files, uploads, logs and existing zips, then **aborts if it finds anything that looks like a real credential**. It uses the system `zip` command (macOS/Linux) or PowerShell `Compress-Archive` (Windows).

Manual fallback (macOS/Linux):

```bash
zip -r wonderktm-ecommerce-source.zip . -x "*/node_modules/*" "node_modules/*" "*/dist/*" ".env" "*/.env" "*/uploads-*/*" "*.zip" "*.log" ".git/*"
```

Verify: `unzip -l wonderktm-ecommerce-source.zip | grep -E "\.env|node_modules"` should list only `.env.example` files.
