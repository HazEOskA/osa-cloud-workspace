# OSA Cloud Workspace

Prywatna, mobilna sterownia read-only, która pokazuje zasoby Google Cloud i deterministyczny łańcuch wdrożenia.

## Zasady projektu

- **GitHub = Source of Truth dla kodu.**
- **Google Cloud = runtime i infrastruktura.**
- **OSA Cloud Workspace = read-only control desk nad GCP.**
- Interfejs i komunikaty użytkownika są domyślnie **po polsku**.
- Brak evidence oznacza UNKNOWN / NIEPOŁĄCZONE — nigdy nie pokazujemy fikcyjnych statusów.
- Backend w produkcji używa **Application Default Credentials (ADC)** i przypiętego, user-managed Service Account.
- Brak endpointów uruchamiania buildów, deployu, zmiany ruchu, VM, sekretów lub usuwania zasobów.

## Architektura Deployment Inventory

~~~text
GitHub source SHA
  │
  ▼
Cloud Build: build ID + results.images.digest
  │
  ▼
Artifact Registry: immutable image@sha256
  │
  ▼
Cloud Run: latest ready revision + live URL
  │
  └── ADC → user-managed Service Account
             ├── Compute Engine API
             ├── Cloud Run API
             ├── Cloud Build API
             └── Artifact Registry API
~~~

Join provenance nie używa czasu. Łańcuch ma status VERIFIED wyłącznie wtedy, gdy live rewizja Cloud Run ujawnia obraz z @sha256, ten sam digest istnieje w Artifact Registry i dokładnie jeden zakończony sukcesem Cloud Build zwraca go w results.images.digest wraz z source SHA. Każda luka lub niejednoznaczność daje UNKNOWN.

## Zakres read-only

- status projektu i principal ADC,
- lista VM z Compute Engine,
- lista usług i latest ready revision Cloud Run dla skonfigurowanych regionów,
- historia Cloud Build z fallbackiem COMMIT_SHA → SHORT_SHA → repoSource.commitSha,
- obrazy i digesty Artifact Registry,
- macierz service → source SHA → build → digest → revision → URL,
- częściowe wyniki, gdy pojedynczy region lub API nie odpowiada,
- brak mutacji infrastruktury.

## Lokalne uruchomienie

Wymagania: Node.js 22+ i Google Cloud CLI.

~~~bash
gcloud auth application-default login
gcloud config set project TWOJ_PROJECT_ID
cp .env.example .env.local
npm install
npm run dev
~~~

GCP_PROJECT_ID jest opcjonalny. Jeśli go nie ustawisz, backend spróbuje wykryć projekt z ADC / środowiska Google Cloud.

## Produkcja na Cloud Run

W produkcji **nie ustawiaj GOOGLE_APPLICATION_CREDENTIALS**. Do usługi Cloud Run przypinamy dedykowany Service Account z minimalnymi rolami read-only:

~~~text
roles/compute.viewer
roles/run.viewer
roles/cloudbuild.builds.viewer
roles/artifactregistry.reader
~~~

OAuth scope cloud-platform służy tylko do uzyskania tokenu ADC; realny zakres dostępu ogranicza IAM powyższego user-managed Service Account. Nie zapisujemy kluczy JSON w repo.

## Read-only API

~~~text
GET /api/gcp/status
GET /api/gcp/vms
GET /api/gcp/cloud-run
GET /api/gcp/builds
GET /api/gcp/deployments
~~~

/api/gcp/deployments zwraca dane częściowe wraz z tablicą errors. Błąd jednego regionu nie kasuje poprawnych wyników z pozostałych regionów.

## Walidacja

~~~bash
npm run typecheck
npm test
npm run build
docker build -t osa-cloud-workspace:local .
docker run --rm -p 8080:8080 -e PORT=8080 osa-cloud-workspace:local
~~~

Cloud Build tworzy rewizję z --no-traffic i suffixem równym $BUILD_ID. Migracja ruchu jest osobnym, ręcznym krokiem poza tym pipeline.

## Status

deployment-inventory-readonly — implementacja wymaga live smoke w uwierzytelnionym projekcie GCP przed migracją ruchu.
