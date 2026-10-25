# Habi helyi worker csomag

Ez a Python-csomag jelenleg a hostkonfiguráció ellenőrzését tartalmazza. Még nincs benne poller, lease-kezelő, Ollama-hívás, hostzár-integráció vagy telepítő. A Mac felé nem kerülhet Atlas URI, SSO felhasználói klienskulcs vagy személyes credential. A jövőbeli worker csak kifelé hívja az engedélyezett cloud API-t.

## Ellenőrzés

- Python 3.9+.
- `uv sync --frozen` telepíti a `uv.lock` szerinti csomagot.
- `uv run python -m unittest discover -s tests -v` futtatja a konfigurációpróbákat.

Éles hoston csak a szerződés szerinti, ellenőrzött model digest, prompt hash, meglévő hostzár és worker-identitás használható. Ezek az értékek most nincsenek beállítva, ezért a worker nem indulhat. A Habi webalkalmazás és a worker külön konfigurációt és telepítési életciklust kap.
