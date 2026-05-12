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
- Anticipazione: il risultato è sorprendente — la GPU embedded batte il laptop sia in velocità che in consumo.

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
- Cliccare **🧠 Analizza**: partono 4 chiamate in sequenza
- Mostrare il **log in tempo reale**: `[00:12] 1/4 eventi e task... ↳ prompt 420 tok · gen 312 tok · 10.2 tok/s`
- Mostrare il **power badge** nel risultato: `⚡ 40 W · 10 tok/s · 68s`
- Risultati: eventi & task con priorità, riassunto strutturato, suggerimenti pratici, connessioni tematiche tra note
- Mostrare la **modifica inline** di un evento estratto dall'AI
- Mostrare la **chat recap**: *"Rendi il riassunto più formale"* → l'AI risponde e applica una patch JSON all'analisi in tempo reale

---

### 5. Demo — Chat con le note (3 min)
- Tre modalità:
  - **💬 Libera**: dialogo diretto col modello, nessun contesto iniettato
  - **📋 Note**: il modello riceve un indice di tutte le note (data + sintesi) e il contenuto completo di quelle più rilevanti. Domanda: *"Di cosa ho parlato lunedì?"* — il modello risponde senza dover cercare per keyword
  - **✏️ Recap**: modifica interattiva dell'analisi corrente via chat
- Mostrare il **selettore note manuale**: si possono scegliere esplicitamente le note da includere nel contesto, invece di affidarsi alla ricerca automatica
- Mostrare la **barra del contesto** sotto l'input: indica quanti token del modello sono già occupati dal prompt (su 24.576 totali)
- Mostrare la risposta che appare **lettera per lettera** durante la generazione — nessun "caricamento", si vede il modello pensare

---

### 6. Demo — Benchmark live CPU vs Jetson (4 min)
- Dal **chip dispositivo nell'header** (in alto a sinistra): cliccare per aprire il pannello
- Switchare backend da Tuxedo a Jetson con un click — l'app si riconnette in tempo reale
- Fare la stessa analisi su entrambe le macchine
- Confrontare i risultati:
  - **Tuxedo CPU**: ~10 tok/s · ~40 W (misurati via RAPL Intel)
  - **Jetson GPU**: ~14 tok/s · ~20 W (misurati via INA sensor su board)
- Conclusione: il Jetson vince sia in velocità (+40%) che in efficienza (metà dei watt) — la GPU embedded batte la CPU su inferenza LLM
- Il Tuxedo resta utile per flessibilità, prototipazione rapida e nessun setup GPU

---

### 7. Under the hood — Come funziona (2 min)
- Il testo viene spezzato in **token** — pezzetti di parola. Il modello genera un token alla volta.
- **Gemma 4 26B MoE**: 26 miliardi di parametri totali, ma solo ~4B attivi per token (Mixture of Experts). Velocità da modello piccolo, qualità da modello grande.
- **Quantizzazione Q4**: i pesi passano da 60 GB (fp16) a 16 GB su disco — perdita di qualità minima, ma entra in RAM.
- Su CPU: pinnato ai soli P-core (0-11) via `taskset`, CPU governor a `performance`. Senza questi accorgimenti le performance calano del 25-30%.
- **Trascrizione**: faster-whisper (CTranslate2) su server HTTP persistente, `large-v3-turbo`.

---

### 8. Perché Gemma 4 MoE è sorprendente su CPU (2 min)
- 26 miliardi di parametri totali, ma solo ~4B attivi per token (Mixture of Experts)
- Il router sceglie dinamicamente quali "esperti" attivare per ogni token
- Risultato pratico: velocità da modello 4B, qualità da modello molto più grande
- Fine-tuned multilingua: capisce italiano parlato, accenti, frasi incomplete da trascrizione audio

---

### 9. Conclusioni (2 min)
- L'AI locale non è più un esperimento: è misurabile, confrontabile, deployabile
- La scelta dell'hardware conta: GPU embedded vs CPU cambia tutto in termini di velocità ed efficienza
- Non serve il cloud per avere un assistente AI utile — serve il modello giusto, il runtime giusto, e qualche ora di configurazione
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
