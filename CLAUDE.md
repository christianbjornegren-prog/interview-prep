# Intervjucoach – Projektöversikt

## Syfte
AI-driven intervjuträningsapp för konsulter. Träna inför specifika 
uppdrag baserat på din egen kompetensbank.

## Tech Stack
- React + Vite, HashRouter, Tailwind CSS
- Firebase (Firestore + Auth + Storage), Blaze-plan
- Claude API (kompetensextraktion, jobbanalys, feedback)
- OpenAI Whisper (STT) + TTS via Vercel-proxy
- GitHub Pages via GitHub Actions CI/CD
- Lokal dev: localhost:5173

## Arkitektur
- Vercel används ENBART som proxy för OpenAI-anrop (api/whisper.js, api/tts.js)
- Firebase hanterar all data och auth
- WebRTC-versionen är övergiven – använd ENBART TTS-versionen (InterviewSimulatorTTS.jsx)

## Datamodell
users/{uid}/competencies/{docId}
users/{uid}/jobs/{jobId}
users/{uid}/jobs/{jobId}/feedback/{feedbackId}

## Viktiga beslut
- Kompetensbanken är kumulativ – byggs av flera CV-uppladdningar över tid
- Matchning sker per jobbannons mot hela kompetensbanken
- Feedback sparas med historik per jobbannons
- Jobbannonser sorteras på senaste aktivitet, arkivering som opt-in

## Miljövariabler (.env.local)
VITE_FIREBASE_PROJECT_ID=interview-prep-81cb6 (INTE .firebaseapp.com)
VITE_FIREBASE_STORAGE_BUCKET=interview-prep-81cb6.appspot.com

## UI-konventioner
- Kompetensbanken visar kompetenser grupperade per kategori i accordion (alla kollapsade by default)
- Filter-chips i kompetensbanken behålls och styr vilka kategorier som syns
- JobPage har ENBART två tabbar: "Förberedelse" och "Historik" (Intervjufrågor-tabben är borttagen)
- Intervjuflödet: JobPage → konfigurationsskärm (ersätter tab-innehållet) → InterviewSimulatorTTS
- Konfigurationsskärm: tvåkolumns layout — vänster: inställningar, höger: live-preview av frågor
- Konfiguration skickas som location.state: { numQuestions, focus, difficulty, selectedQuestions }
- selectedQuestions är den förberäknade listan — simulatorn använder den direkt

## Intervjukonfiguration (standardvärden)
- Antal frågor: 5 (alternativ: 3, 5, 8)
- Fokus: Mix (alternativ: Erfarenhet, Kompetens, Situation)
- Svårighetsgrad: Standard (alternativ: Avslappnad, Standard, Hård)

## Gap-analys & kompetenser
- sanitizeCompetencies() i claude.js är den enda platsen kompetenser normaliseras
  → skickar { namn, beskrivning, taggar } — inga ID-fält
- Används i: analyzeJobPosting, analyzeInterviewFeedback, saveSession
- NO_ID_INSTRUCTION-konstanten i claude.js läggs till i alla relevanta prompter

## Intervju state machine (InterviewSimulatorTTS)
States: CONNECTING → AI_SPEAKING → WAITING_FOR_USER → RECORDING → PROCESSING → (loop eller FINISHED)
- CONNECTING: grå ring snurrar, ingen knapp
- AI_SPEAKING: blå ring pulsar, frågetext visas, ingen knapp  
- WAITING_FOR_USER: grön ring stillastående, "Din tur", klick-knapp
- RECORDING: röd ring pulsar, klick-knapp "Klar"
- PROCESSING: gul ring snurrar, ingen knapp
- FINISHED: teal ring, sparar feedback → navigate till /feedback/
- speakText() signalerar AI_SPEAKING när playback börjar (inte vid fetch)
- Inspelning är click-toggle (inte push-to-hold), minimum 1 sekund
- Simulatorn auto-startar intervjun när jobb laddas (inget "Starta"-steg)

## TTS / Röst
- Model: tts-1-hd (uppgraderat från tts-1)
- Röst väljs slumpmässigt vid sessionstart baserat på kön
  - Kvinnliga röster: shimmer, nova, alloy → namn: Maria, Anna, Sara
  - Manliga röster: onyx, echo, fable → namn: Erik, Johan, Anders

## Konventioner
- Svenska i hela UI
- Pusha aldrig till main utan att testa lokalt först
- Uppdatera alltid CLAUDE.md efter varje förändring som påverkar 
  arkitektur, datamodell eller viktiga beslut
