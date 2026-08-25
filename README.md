# OSA Cloud Workspace

Prywatna, uproszczona sterownia Google Cloud dla aplikacji, stron WWW, VPS-ów, wdrożeń i automatyzacji.

## Zasady projektu

- **GitHub = Source of Truth dla kodu.**
- **Google Cloud = runtime i infrastruktura.**
- **OSA Cloud Workspace = control plane nad GCP.**
- Interfejs i komunikaty użytkownika są domyślnie **po polsku**.
- Brak evidence oznacza `UNKNOWN` / `NIEPOŁĄCZONE` — nigdy nie pokazujemy fikcyjnych statusów.
- Backend w produkcji używa **Application Default Credentials (ADC)** i przypiętego, user-managed Service Account. Nie przechowujemy kluczy Service Account w repo.
- Najpierw read-only discovery; akcje modyfikujące infrastrukturę dochodzą później i mają jawne guardraile.

## Architektura v0.1

```text
GitHub
  │
  │ source
  ▼
Cloud Build
  │
  ▼
Artifact Registry
  │
  ▼
Cloud Run: osa-cloud-workspace
  │
  ├── UI (Next.js)
  └── Backend API
       │
       └── ADC → user-managed Service Account
                    │
                    ├── Compute Engine API
                    ├── Cloud Run API
                    └── kolejne API GCP
```

## Pierwszy zakres

- polski dashboard,
- status połączenia z GCP,
- wykrywanie Project ID przez ADC,
- lista VM z Compute Engine,
- lista usług Cloud Run dla skonfigurowanych regionów,
- brak destrukcyjnych operacji.

## Lokalne uruchomienie

Wymagania: Node.js 22+ i Google Cloud CLI.

```bash
gcloud auth application-default login
gcloud config set project TWOJ_PROJECT_ID
cp .env.example .env.local
npm install
npm run dev
```

`GCP_PROJECT_ID` jest opcjonalny. Jeśli go nie ustawisz, backend spróbuje wykryć projekt z ADC / środowiska Google Cloud.

## Produkcja na Cloud Run

W produkcji **nie ustawiaj `GOOGLE_APPLICATION_CREDENTIALS`**. Do usługi Cloud Run przypinamy dedykowany Service Account z minimalnymi rolami read-only.

Minimalny start:

```text
roles/viewer
roles/run.viewer
roles/compute.viewer
```

Docelowo zawęzimy role dokładniej po pierwszym discovery.

## Status

`v0.1-foundation` — repo i backend integration layer są budowane.

2026-08-25: ręczny `OSA_ADMIN_TOKEN` został usunięty z flow deployu; aktualny `main` używa Google Identity i nie wymaga wklejania tokenu administracyjnego.