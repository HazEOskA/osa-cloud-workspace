<div align="center">

# 🐝 OSA CLOUD WORKSPACE

### One Control Plane for the whole OSA stack

<img src="docs/assets/osa-workspace-hero.jpg" alt="OSA Cloud Workspace — bees building on Google Cloud" width="100%" />

<br />

[![CI](https://github.com/HazEOskA/osa-cloud-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/HazEOskA/osa-cloud-workspace/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=nextdotjs)
![React](https://img.shields.io/badge/React-19.2-149ECA?style=flat-square&logo=react&logoColor=white)
![Node](https://img.shields.io/badge/Node-%3E%3D22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Google Cloud](https://img.shields.io/badge/Google_Cloud-Control_Plane-4285F4?style=flat-square&logo=googlecloud&logoColor=white)
![Cloud Run](https://img.shields.io/badge/Cloud_Run-LIVE-4285F4?style=flat-square&logo=googlecloud&logoColor=white)

**GitHub → Cloud Build → Artifact Registry → Cloud Run**

`AGENTS` · `AUTOMATIONS` · `PROJECTS` · `DEV TOOLS` · `TEST LAB` · `DEPLOY` · `INFRA` · `COSTS`

> **No evidence = UNKNOWN. No fake green lights.**

</div>

---

## ⚡ Co to jest

**OSA Cloud Workspace** to mobilny i desktopowy control plane nad moim środowiskiem developerskim i Google Cloud.

Nie jest kolejnym dashboardem do patrzenia na wykresy. Ma być miejscem, z którego **otwieram projekt, sprawdzam agenta, odpalam test, wchodzę do dev tools, uruchamiam build, robię deploy i widzę evidence całego pipeline'u**.

### V2 Control Center

| Moduł | Do czego służy |
| --- | --- |
| 🐝 **Agents** | runtime/agent discovery, status, task surface i wejście do kontroli agentów |
| ⚙️ **Automations** | Cloud Build runs, schedulery, workflow i automatyzacje |
| 🗂️ **Project Portfolio** | repo + branch + SHA + deployment evidence + live target |
| 🛠️ **Dev Tools** | Workstations, Cloud Shell, Cloud Run, Build, Logs, Artifacts, Secrets, Compute, Monitoring, Scheduler, SQL, IAM |
| 🧪 **Test Lab** | szybkie probe'y endpointów i testowanie działających usług |
| 🚀 **Deploy Center** | repo → branch → build → image → revision → URL |
| 🖥️ **Infrastructure** | Cloud Run, VM i aktualny stan infrastruktury |
| 💳 **Costs / Usage** | powierzchnia kosztów i usage bez wymyślania danych, których backend nie potwierdził |

### Responsive by design

- **Desktop:** pełny sidebar + cockpit wielokolumnowy.
- **Mobile:** własny bottom navigation + jednokolumnowy flow.
- UI i komunikaty operatora są domyślnie **po polsku**.
- Brak danych z API = `UNKNOWN` / `NIEPOŁĄCZONE`.

---

## 🧠 Zasada nadrzędna

```text
CLAIM
  ↓
EVIDENCE
  ↓
ACTION
```

Jeżeli Workspace nie potrafi czegoś potwierdzić, **nie udaje, że wie**.

```text
CONNECTED     = backend ma evidence
LIVE          = runtime/deployment potwierdzony
FAILED        = potwierdzony błąd
UNKNOWN       = brak wystarczającego evidence
NIEPOŁĄCZONE  = integracja nie jest skonfigurowana
```

---

## 🏗️ Architektura

```text
                        OSA CLOUD WORKSPACE
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
          MOBILE UI                            DESKTOP UI
              │                                     │
              └──────────────────┬──────────────────┘
                                 │
                         NEXT.JS CONTROL PLANE
                                 │
       ┌───────────┬─────────────┼─────────────┬─────────────┐
       │           │             │             │             │
       ▼           ▼             ▼             ▼             ▼
    GitHub      Cloud Run    Cloud Build      VM/Infra     Test Lab
       │           │             │             │             │
       │           │             │             │             └─► live endpoints
       │           │             │             │
       │           │             │             └─► Compute Engine
       │           │             │
       │           │             └─► Artifact Registry
       │           │                     │
       │           │                     ▼
       │           └──────────────► image digest
       │                                 │
       └─► repo / branch / SHA            ▼
                                      Cloud Run revision
                                             │
                                             ▼
                                           URL
```

### Source of truth

```text
GitHub       = kod
Google Cloud = runtime + infrastruktura
Workspace    = control plane + operator UX
```

---

## 🚀 One Control Plane Deploy

Flow deployu jest celowo prosty:

```text
GitHub repository
      │
      ▼
branch / commit SHA
      │
      ▼
Cloud Build
      │
      ▼
Artifact Registry
      │
      ▼
image digest
      │
      ▼
Cloud Run revision
      │
      ▼
live URL
```

Workspace nie powinien kończyć na komunikacie **"build success"**. Docelowe evidence to pełny łańcuch:

```text
SOURCE SHA → BUILD ID → IMAGE DIGEST → READY REVISION → LIVE URL
```

---

## 🔐 Google Admin Auth

Akcje administracyjne korzystają z Google Identity. Ręczny `OSA_ADMIN_TOKEN` został usunięty z flow deployu.

Cloud Run potrzebuje:

```env
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
OSA_ADMIN_EMAIL=your-admin-google-account@example.com
```

Backend weryfikuje Google ID token oraz:

```text
email_verified == true
email == OSA_ADMIN_EMAIL
audience == GOOGLE_CLIENT_ID
```

Nie przechowuj klucza Service Account w repo i **nie ustawiaj `GOOGLE_APPLICATION_CREDENTIALS` na Cloud Run**.

---

## ☁️ Google Cloud runtime

Produkcja działa przez **Application Default Credentials (ADC)** oraz user-managed Service Account przypięty do Cloud Run.

Minimalny read-only baseline:

```text
roles/viewer
roles/run.viewer
roles/compute.viewer
```

Uprawnienia powinny rosnąć tylko wtedy, gdy konkretna funkcja Workspace faktycznie ich wymaga.

---

## 🧰 Lokalne uruchomienie

Wymagania:

```text
Node.js >= 22
Google Cloud CLI
ADC dla wybranego projektu
```

Start:

```bash
gcloud auth application-default login
gcloud config set project TWOJ_PROJECT_ID
cp .env.example .env.local
npm install
npm run dev
```

Walidacja przed zmianami:

```bash
npm run typecheck
npm test
npm run build
```

Aktualny stack aplikacji:

```text
Next.js 16.3.0
React 19.2.0
TypeScript 5.9+
google-auth-library 10.9.1
Node.js >= 22
```

---

## 🧪 CI contract

Zmiana nie jest "gotowa", dopóki nie przejdzie:

```text
INSTALL
  ↓
TYPECHECK
  ↓
TEST
  ↓
PRODUCTION BUILD
```

Deploy i runtime są osobnym poziomem evidence. Zielone CI **nie oznacza automatycznie**, że nowa rewizja jest już live.

---

## 📱 Operator UX

Workspace powstaje przede wszystkim po to, żeby nie trzeba było skakać po kilkunastu ekranach Google Cloud z telefonu.

Najczęstsze akcje mają prowadzić bezpośrednio do:

```text
TEST
DEV
BUILD
DEPLOY
LOGS
RUNTIME
AUTOMATIONS
PROJECTS
```

Dev Tools są launcherem do natywnych powierzchni GCP, kiedy potrzebny jest pełny panel administracyjny.

---

## 🐝 Philosophy

```text
FOCUS
BUILD
VERIFY
GROW
```

Każda osa robi swoją robotę. Jedna pilnuje agentów, druga automatyzacji, następna buildów, deploymentów, infrastruktury i testów — ale wszystko kończy się w **jednym control plane**.

---

## 📌 Status

```text
OSA CLOUD WORKSPACE V2
──────────────────────────────
Control Center UI       READY
Mobile layout           READY
Desktop layout          READY
GitHub integration      READY
GCP discovery           READY
Deploy flow             READY
Google admin auth       CONFIGURABLE
Evidence semantics      READY
Costs exact billing API NOT YET CONNECTED
```

`main` pozostaje source of truth.

---

<div align="center">

### 🐝 Build strong systems. Verify everything.

If this workspace is useful to you, leaving a **⭐** helps other builders find it.

**OSA Workspace — Focus · Build · Verify · Grow**

</div>
