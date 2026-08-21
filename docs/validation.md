# Walidacja Deployment Inventory

Wymagane lokalne evidence:

~~~bash
npm run typecheck
npm test
npm run build
git diff --check
~~~

Wymagane evidence kontenera:

~~~bash
docker build -t osa-cloud-workspace:local .
docker run --rm -p 8080:8080 -e PORT=8080 osa-cloud-workspace:local
curl -fsS http://127.0.0.1:8080/
curl -sS http://127.0.0.1:8080/api/gcp/status
~~~

Brak ADC w lokalnym kontenerze ma dać jawne connected: false / HTTP 503, a nie fałszywy sukces.

Authenticated GCP smoke musi zapisać dokładny projectId i principal z /api/gcp/status, a następnie sprawdzić:

~~~text
/api/gcp/vms
/api/gcp/cloud-run
/api/gcp/builds
/api/gcp/deployments
~~~

Rewizję kandydującą wolno utworzyć wyłącznie z --no-traffic. Test kończy się przed migracją ruchu.

Verdict wynika wyłącznie z aktualnych logów komend i odpowiedzi API. Brak statusu = UNKNOWN.
