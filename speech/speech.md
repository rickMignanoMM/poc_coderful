# Speech — AI Locale su Hardware Consumer

## Obiettivo del talk
Dimostrare che l'AI generativa locale — senza cloud, senza API key, senza mandare un byte fuori dalla rete — è già oggi praticabile su hardware reale, misurabile in watt e tok/s, e utile per un caso d'uso concreto.

---

## Scaletta

### 1. Hook (1 min)
- Quanti di voi usano ChatGPT per prendere appunti, riassumere meeting, organizzare idee?
- Quanto vi piacerebbe che girasse sul vostro laptop, offline, senza abbonamento?
- Oggi lo facciamo — dal vivo.

---

### 2. Hardware in scena (2 min)
- Due macchine sul tavolo:
  - **Tuxedo PC** — Intel Core Ultra 7 155H, 64 GB RAM, GPU integrata inutilizzata. Solo CPU.
  - **Jetson Orin** — ARM Cortex-A78AE + GPU Ampere embedded. Edge AI.
- Stesso modello, stesso prompt, architetture completamente diverse.
- Alla fine sapremo quale consuma meno per token generato.

---

### 3. Demo — Registrazione e trascrizione (3 min)
- Aprire l'app su `https://<ip>:3443`
- Registrare una nota vocale dal telefono o dal browser
- Mostrare la trascrizione automatica: appare in pochi secondi
- **Dettaglio tecnico**: Whisper gira su un server HTTP persistente — il modello viene caricato una volta sola all'avvio, non ad ogni richiesta. Questo elimina il cold start da 5-10 secondi.
- Evidenziare: nessuna chiamata a cloud. Il traffico non lascia la LAN.

---

### 4. Demo — Pulizia e analisi AI (5 min)
- Cliccare **✨ Sistema note**: l'AI corregge la trascrizione grezza, estrae una sintesi e assegna un sentiment con emoji
- Cliccare **🧠 Analizza**: partono 4 chiamate in parallelo
- Mostrare il **log in tempo reale**: `[00:12] 1/4 eventi e task... ↳ 312 tok · 18.4 tok/s`
- Mostrare il **power badge** nel risultato: `⚡ 14.2 W · 18.4 tok/s · 42s`
- Risultati: eventi & task con priorità, riassunto strutturato, suggerimenti pratici, connessioni tematiche tra note
- Mostrare la **modifica inline** di un evento estratto dall'AI
- Mostrare la **chat recap**: *"Rendi il riassunto più formale"* → l'AI risponde e applica una patch JSON all'analisi in tempo reale

---

### 5. Demo — Chat con le note (3 min)
- Tre modalità:
  - **💬 Libera**: dialogo diretto col modello, nessun contesto iniettato
  - **📋 Note**: keyword search sulle trascrizioni → top-5 note rilevanti iniettate come contesto. Domanda: *"Di cosa ho parlato lunedì?"*
  - **✏️ Recap**: modifica interattiva dell'analisi corrente via chat
- Mostrare la risposta che appare **lettera per lettera** durante la generazione — nessun "caricamento", si vede il modello pensare

---

### 6. Demo — Benchmark live CPU vs Jetson (4 min)
- Dal badge in basso a sinistra: cliccare per aprire il pannello dispositivi
- Switchare backend da Tuxedo a Jetson con un click — l'app si riconnette in tempo reale
- Fare la stessa analisi su entrambe le macchine
- Confrontare i risultati dal power badge:
  - **Tuxedo**: tok/s, watt (misurati via RAPL Intel)
  - **Jetson**: tok/s, watt (misurati via INA sensor su board)
- Discussione: il Jetson vince in efficienza energetica (meno W/token), il Tuxedo vince in velocità assoluta. Dipende dal contesto d'uso.

---

### 7. Under the hood — Lo stack (3 min)
- **Frontend**: Vue 3 + Vite — SSE polling, PWA-ready, responsive mobile
- **Backend**: Node.js + Express — job store in memoria, HTTPS locale con certificati mkcert
- **LLM**: llama.cpp con Gemma 4 26B-A4B (MoE, Q4_K_M, 16 GB su disco)
  - Flash Attention ON, KV cache quantizzata q8_0
  - Pinnato ai soli P-core (0-11) via `taskset` — gli E-core rallentano l'inferenza per il problema degli "stragglers"
  - CPU governor impostato a `performance` all'avvio — senza questo il processore gira al 50% della frequenza massima
- **Trascrizione**: faster-whisper (CTranslate2) su server HTTP persistente, `large-v3-turbo`, `beam_size=1`
- **Energia**: RAPL su Intel (`/sys/class/powercap/`), INA hwmon su Jetson — nessun tool esterno

---

### 8. Perché Gemma 4 MoE è sorprendente su CPU (2 min)
- 26 miliardi di parametri totali, ma solo ~4B attivi per token (Mixture of Experts)
- Il router sceglie dinamicamente quali "esperti" attivare per ogni token
- Risultato pratico: velocità da modello 4B, qualità da modello molto più grande
- Fine-tuned multilingua: capisce italiano parlato, accenti, frasi incomplete da trascrizione audio

---

### 9. Conclusioni (2 min)
- L'AI locale non è più un esperimento: è misurabile, confrontabile, deployabile
- La scelta del runtime e della topologia CPU ha impatto reale sulle performance — non è solo una questione di VRAM
- Il dato più interessante non è "quanti tok/s" ma "quanti tok per joule"
- **Prossimi passi**: trascrizione streaming in tempo reale, pannello benchmark comparativo affiancato, supporto multi-utente

---

## Note per il presentatore

- Avviare tutto con `./start-llama.sh && ./start.sh` almeno 2 minuti prima
- Verificare llama-server: `curl http://127.0.0.1:8080/health`
- Verificare Whisper server: `curl http://127.0.0.1:8765`
- Avere già 2-3 note registrate come fallback se il microfono non funziona
- Il Jetson deve essere già avviato con `./start-jetson.sh` e raggiungibile in LAN
- Se la connessione al Jetson è lenta, fare il benchmark sequenzialmente non in parallelo
- Easter egg: il bottone 👾 nell'header attiva la modalità 8-bit — ottimo per rompere il ghiaccio

**Durata totale stimata: ~25 minuti** + domande
