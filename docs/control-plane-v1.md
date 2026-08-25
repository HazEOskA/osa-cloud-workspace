# OSA Cloud Workspace — One Control Plane

## Cel

Jeden panel z telefonu/PC do wyboru repozytorium, brancha i uruchomienia Cloud Build → Artifact Registry → Cloud Run.

## Sekrety i konfiguracja serwera

Sekrety nie są wpisywane w przeglądarce.

W Cloud Run ustaw:

- `GOOGLE_CLIENT_ID` — OAuth 2.0 Web Client ID dla Google Identity Services.
- `OSA_ADMIN_EMAIL` — jedyne konto Google uprawnione do operacji modyfikujących.
- `GITHUB_TOKEN` — serwerowy token GitHub z prawem odczytu repozytoriów/branchy, w tym prywatnych.
- `GITHUB_TOKEN_SECRET` — opcjonalna nazwa sekretu Secret Manager używanego przez Cloud Build; domyślnie `osa-github-token`.

Dla prywatnych repo Cloud Build pobiera token wyłącznie z Secret Manager jako `secretEnv`; token nie jest zwracany do UI ani zapisywany w repo.

## Wymagane IAM

Service account `osa-cloud-build@PROJECT_ID.iam.gserviceaccount.com` musi mieć dostęp do odczytu sekretu `osa-github-token` oraz istniejące role potrzebne do Cloud Build, Artifact Registry i Cloud Run.

Runtime service account `osa-cloud-workspace@PROJECT_ID.iam.gserviceaccount.com` pozostaje tożsamością panelu do GCP API.

## Zasada bezpieczeństwa

- READ: statusy GCP i lista repo mogą działać bez logowania użytkownika.
- MUTATION: `/api/deploy` wymaga poprawnego Google ID tokenu dla `OSA_ADMIN_EMAIL`.
- Brak konfiguracji lub dowodu = `UNKNOWN` / `NIEPOŁĄCZONE`.
- UI nie przechowuje ręcznego admin tokena.
