# Speech — Presentazione del progetto

## Obiettivo del talk
Dimostrare come un'AI generativa locale, senza cloud, possa trasformare note vocali in analisi strutturate in tempo reale — girando su hardware consumer.

---

## Scaletta

### 1. Introduzione (2 min)
- Chi siamo, contesto del progetto
- La domanda di partenza: *"Posso avere un assistente AI privato, veloce, senza mandare dati fuori dalla mia rete?"*
- Hardware in scena: Intel Core Ultra 7 155H (CPU) vs NVIDIA Jetson Orin (edge GPU)

---

### 2. Il problema che risolviamo (2 min)
- Le note vocali sono il formato più naturale per catturare idee
- Ma restano "rumore" finché qualcuno non le elabora
- L'AI può farlo in automatico: trascrivere, pulire, estrarre eventi, riassumere, trovare connessioni

---

### 3. Demo live — Registrazione e trascrizione (3 min)
- Aprire il backoffice su `localhost:3000`
- Registrare una nota vocale dal browser (o caricare un file)
- Mostrare la trascrizione automatica via Whisper (Python locale)
- Evidenziare: **nessuna chiamata a cloud**, tutto in locale

---

### 4. Demo live — Analisi AI (4 min)
- Cliccare "🧠 Analizza" sulla nota appena trascritta
- Mostrare il log in tempo reale: tok/s, latenza
- Risultato: eventi & task, riassunto, suggerimenti, connessioni tematiche
- Mostrare la modifica inline di un evento estratto
- Mostrare la chat recap: *"Cambia il tono del riassunto, rendilo più formale"* → patch applicata in automatico

---

### 5. Under the hood — Lo stack (3 min)
- **Frontend**: Vue 3 + Vite, SSE polling, mobile responsive
- **Backend**: Node.js + Express, job store in memoria, HTTPS locale
- **AI**: llama.cpp con Gemma 4 26B MoE (Q4_K_M, 16 GB) — solo CPU
- **Trascrizione**: Whisper via Python
- Aprire `stack.html` per il diagramma visivo dello stack

---

### 6. Perché Gemma 4 MoE è sorprendente su CPU (3 min)
- 26 miliardi di parametri totali, ma solo ~4B attivi per token (Mixture of Experts)
- Il router impara quali expert attivare tramite backpropagation + auxiliary loss
- Risultato: velocità da modello 4B, qualità da modello 26B
- Fine-tuned in italiano: comprende accenti, slang, frasi incomplete da audio

---

### 7. Confronto live CPU vs Jetson Orin (3 min)
- Stessa domanda inviata in parallelo ai due dispositivi
- Mostrare in tempo reale: tok/s, latenza al primo token, watt consumati
- Discussione: quando conviene CPU, quando GPU embedded

---

### 8. Archivio e persistenza (1 min)
- Le analisi vengono salvate nell'archivio locale (JSON)
- Titolo modificabile, sezioni editabili, eliminazione con conferma
- Tutto offline, tutto privato

---

### 9. Conclusioni e domande (2 min)
- AI locale è già oggi praticabile per use case reali
- Il modello giusto per il contesto giusto fa la differenza
- Prossimi passi: integrazione Jetson Orin, metriche energetiche in tempo reale, pannello comparativo

---

## Note per il presentatore

- Tenere il browser aperto su `http://localhost:3000` prima di salire sul palco
- Verificare che llama-server sia attivo: `curl http://127.0.0.1:8080/health`
- Avere già una nota registrata di esempio come fallback se il microfono non funziona
- Il diagramma stack è su `http://localhost:3000/stack.html`
- Durata totale stimata: **~23 minuti** + domande
