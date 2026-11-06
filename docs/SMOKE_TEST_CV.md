# Röktest – CV per uppdrag

Det här går inte att automatisera, eftersom det kräver Google-inloggning, Claude och riktiga
CV-filer. Kör `npm run dev` och öppna http://localhost:5173/interview-prep/.

Ha två eller tre CV-filer redo, till exempel ett arkitekt-CV och ett projektledar-CV för
samma person.

## A. Säljaren: ny konsult (väntande profil)
1. Gå till **Konsulter**, klicka **+ Förbered ny konsult** och fyll i namn och e-post.
2. Profilen öppnas på fliken **Uppdrag**. Där ska det stå "Inga uppdrag ännu…".
3. Klicka **+ Skapa nytt uppdrag åt konsulten** och klistra in en annons.
   - Fältet **CV för uppdraget** visar "Koppla CV senare", eftersom det inte finns några CV:n än.
   - Klicka **Analysera** så kommer du tillbaka till profilen.
4. På uppdragskortet ska det stå **"Inget CV kopplat än"** i en lila inforuta (inte röd, inte gul).
   Ingen "Matchning"-etikett ska synas.
5. Klicka **+ Ladda upp nytt CV för det här uppdraget** och välj arkitekt-CV:t.
   - Efter uppladdningen ska "Analyserar uppdraget mot …" visas, och sedan ska CV:t stå som kopplat.
   - Etiketten "Matchning: X av Y krav" ska dyka upp.
6. Skapa ett **andra uppdrag**. Nu ska arkitekt-CV:t vara **förvalt** (det enda som finns).
7. Gå till fliken **CV** och ladda upp projektledar-CV:t.
   - Två CV-kort ska synas. Arkitekt-CV:t ska ha "Används i: (båda uppdragen)".
   - Projektledar-CV:t ska ha "Används i: Inget uppdrag än".
8. Gå tillbaka till **Uppdrag** och byt CV på uppdrag 2 till projektledar-CV:t.
   - En bekräftelse ska visas: "Byta till …? Kravmatchningen och intervjufrågorna görs om…".
   - Klicka **Avbryt**. Inget ska ändras.
   - Byt igen och klicka **Byt CV**. Analysen körs, och matchningen ska ändras.
9. Klicka på uppdragets titel. Uppdragssidan ska visa raden **CV för uppdraget** med rätt CV.

## B. Konsulten loggar in första gången
1. Logga in som konsulten från steg A.
2. Under **Mina uppdrag** ska båda uppdragen finnas. Under **Mina CV** ska båda CV:n finnas,
   med samma "Används i" som säljaren såg.
3. Öppna uppdrag 2. Det ska fortfarande vara kopplat till projektledar-CV:t, alltså ska kopplingen
   ha följt med vid överlämningen.

## C. Spärren mot träning utan CV
1. Skapa ett uppdrag som konsult och välj **Koppla CV senare**.
2. På uppdragssidan ska följande gälla:
   - **Starta intervjuträning** är gråad, och under knappen står "Koppla ett CV nedan för att kunna starta."
   - En lila inforuta förklarar varför. Förberedelse-fliken visar sammanfattning och annons, men
     ingen kravtäckning.
   - Historik-fliken: startknappen är gråad och har en förklarande text.
3. Kopiera adressen, byt `#/jobb/<id>` till `#/intervju-tts/<id>` och öppna den direkt.
   Du ska få en lugn inforuta och knappen **Tillbaka till uppdraget**. Ingen intervju ska starta.
4. Koppla ett CV. Knappen ska bli aktiv, och en hel träning ska gå att genomföra.
5. Gå till **Mina CV**, radera CV:t och bekräfta. Varningen ska nämna uppdraget.
   Uppdragssidan ska sedan visa "Det kopplade CV:t finns inte längre", och träningen ska vara spärrad igen.

## D. Befintliga konton (äldre data)
1. Logga in som en konsult som hade en kompetensbank före ändringen.
2. **Mina CV** ska visa ett CV per uppladdad fil (CV:ts namn är filnamnet). Manuellt tillagda
   kompetenser ska ligga i "Manuellt tillagda kompetenser". Inga kompetenser får saknas.
3. De gamla uppdragen ska visa "Koppla CV för att träna" på korten. Tidigare historik ska finnas kvar.
4. Ladda om sidan. Det får inte dyka upp några dubblerade CV:n.

## E. Engelska
1. Koppla ett CV, välj **English** i konfigurationen och genomför en träning.
2. Byt CV på uppdraget och välj English igen. De engelska frågorna ska skapas om (du ser
   "Skapar engelska frågor…").

## F. Sådant som inte får ha gått sönder
- Delad feedback hos säljaren och delningsknappen på feedbacksidan.
- Arkivering av uppdrag.
- Inställningar → **Rensa CV:n** och **Rensa allt**.
- Driftöversikten (admin).
