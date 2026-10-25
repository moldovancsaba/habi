# Habi helyi AI worker

## A jelenlegi, tényleges állapot

A Mac Ollama szolgáltatása elérhető a `127.0.0.1:11434` címen. A futó szerver verziója `0.40.3`, a `qwen2.5:7b` modell digestje `845dbda0ea48ed749caafd9e6037047aa19acfcfd82e704d7ca97d631a0b697e`. A `contracts/runtime-manifest.json` és a worker konfiguráció ezt az exact modellt és a `contracts/prompt.md` SHA-256 értékét pineli. A 2026-10-25-ös szintetikus inference smoke check a megadott exact választ adta.

A worker jelenleg `local_synthetic` módban ellenőrzi a modellt, a prompt hash-t, az inference elérhetőségét és a kizárólagos hostzárat. Ez a mód csak `HG_ENVIRONMENT=development` és `HG_SYNTHETIC_DATA_ONLY=true` mellett indul; a cloud API, Atlas, SSO és Mongo kulcsok jelenléte hibát okoz.

## Futtatás

1. Ellenőrizd, hogy a helyi Ollama szolgáltatás fut, és a `qwen2.5:7b` modell a pinelt digesttel telepítve van.
2. Lépj a worker könyvtárba, majd futtasd: `uv sync --frozen`.
3. A shellbe töltsd be a minta változókat: `set -a; source .env.example; set +a`.
4. Indítsd a helyi ellenőrzést: `uv run python -m habi_worker.cli verify-local`, majd `uv run python -m habi_worker.cli smoke-local`.
5. Konfiguráció- és worker-próbák: `uv run python -m unittest discover -s tests -v`.

A lock file alapértelmezés szerint `/tmp/habi-worker.lock`, 0600 jogosultsággal és nem blokkoló `flock`-kal védi az egyetlen lokális worker példányt. A JSON kimenet csak modell-/prompt-verziót és állapotot tartalmaz, promptot vagy generált felhasználói tartalmat nem naplóz.

## Ami még hiányzik

Ez még nem Habi job-worker szolgáltatás: nincs worker token exchange, cloud poller, job lease/heartbeat, context betöltés, eredménybeküldés vagy tartós hiba-visszajátszás. A hosted worker függ a későbbi service-auth és Vercel worker API megvalósításától. A helyi smoke teszt nem kezeli személyes adatot, nem bizonyít szakmai minőséget, és nem kapcsolódik Atlas/Vercelhez.

Atlas URI, felhasználói SSO/session titok és személyes credential soha nem kerülhet a Mac worker konfigurációjába.
