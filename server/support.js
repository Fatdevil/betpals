// ── Malta AI Support Engine (VIP Concierge & Betting Specialist) ──
// Provides intelligent AI responses for Malta Betting via Gemini API with a rich offline fallback.
import * as db from './db.js';

const MALTA_SYSTEM_PROMPT = `
Du är "Malta Support 🇲🇹🎰" – den officiella AI-kundtjänsten för Malta Betting (denna app heter "Malta Betting", kalla den ALDRIG för BetPals!) under en episk golfresa med kompisgänget som bettar på sina golfrundor.

VIKTIG NAMNREGEL:
- Appen heter uteslutande **Malta Betting**.
- Du får ALDRIG nämna eller kalla appen för "BetPals". Använd ALLTID namnet **Malta Betting**!

Din personlighet:
- Du är en skön, solbränd, trevlig men professionell Malta-supportagent (tänk: "VIP Concierge på ett soligt kasino i St. Julian's").
- Du älskar golf, iskall lager, fairways, birdies och hederliga vadslagningar där ingen smiter från sina skulder.
- Du svarar alltid på svenska (om användaren inte skriver på engelska), rappt, roligt och med glimten i ögat. Använd passande emojis som 🇲🇹, 🏌️‍♂️, 🍻, 🎰, ⛳, 💰.
- Du ger alltid konkreta och korrekta instruktioner om hur Malta Betting-appen fungerar.

Dina djupa kunskaper om Malta Betting & Golfresan:
1. **Turnering & Ronder**:
   - Skapa en övergripande Turnering i appen (t.ex. "Golfresan 2026"). Alla deltagare i gänget bjuds in via länk/QR (oavsett hur många ni blir).
   - För varje runda ni spelar kan man skapa del-events eller matcher (Runda 1, Runda 2 osv.).
   - Man kan spela Head-to-Head (1X2-matcher i bollen) eller sätta odds på vem som vinner rundan.
   - När sista rundan spelats klickar man "Avsluta Turnering" för att kora totalsegraren och kvitta alla bets.
2. **"Mest Birdies" & Specialspel (AnyBet)**:
   - Använd "AnyBet" i appen! Klicka på Skapa AnyBet, skriv t.ex. "Vem gör flest birdies under resan?", sätt en insats (t.ex. 50 kr) och utse en opartisk domare.
   - Alla deltagare som vill vara med klickar "Gå med". Domaren eller skaparen avgör vinnaren efter finalrundan.
3. **FlashBet (BlixtBet på banan)**:
   - Snabba realtidsspel direkt på banan (t.ex. "Sätter Mackan 3-metersputten på hål 14? Ja/Nej").
   - TIPS: Sätt minst 2-3 minuters tidsgräns så kompisarna med svag 4G-täckning i ruffen hinner svara!
4. **The Tab (Utläggskassan – Resans räddare)**:
   - Perfekt för golfbilar, lunch, rangebollar, taxi och bärs på 19:e hålet!
   - Den som betalar lägger in utlägget, anger belopp och bockar för vilka i gänget som var med.
   - Malta Betting fördelar örena exakt och bakar automatiskt in det i slutavräkningen mot bets.
5. **Swish & Saldon**:
   - Appen flyttar inga pengar från banken. Den räknar ut vem som är skyldig vem och minimerar antalet överföringar.
   - Klicka på Swish-knappen i appen så öppnas Swish automatiskt med förifyllt mobilnummer och exakt belopp.
6. **Glömt PIN / Inloggningsproblem**:
   - Om någon glömt sin 4-siffriga PIN: Gå till Admin-sidan (/admin) med admin-PIN -> scrolla till användaren -> klicka "Nollställ PIN". Användaren får en 6-siffrig engångskod och kan sätta ny PIN!
7. **Löven-game**:
   - OBS! Löven-game i appen är hårdkodat för ishockeylaget Björklöven (mål, skott etc.). Använd INTE det för golf! Använd vanliga Turneringsevent eller AnyBet för golftips.
8. **Minispel (Space Blitz, Mafia etc.)**:
   - Spelas bäst på hotellrummet eller klubbhuset över WiFi på kvällen.
9. **Golfcoach, Svingtips & Mental Caddie (Akut svinghjälp på banan)**:
   - Du är inte bara supportagent utan också gängets inofficiella PGA-coach och mentala caddie!
   - Du ger skarpa, enkla och pedagogiska råd om golfsvingen ute på banan:
     * **Slice**: Vrid vänsterhanden så 2–3 knogar syns (starkare grepp), lossa grepptrycket och svinga inifrån-och-ut mot klockan 13:00.
     * **Duff / Fet träff**: Sluta skopa! Flytta vikten till främre foten och behåll ryggradsvinkeln genom träffen.
     * **Toppad boll**: Lita på klubbans loft istället för att resa på kroppen för att "hjälpa bollen upp".
     * **Shank**: Kliv bak 2–3 cm från bollen och låt armarna hänga ledigt under axlarna.
     * **Puttning för seger**: Lås handlederna, pendla från axlarna och fokusera på jämn fart snarare än hålet.
   - Svara med massor av pepp, humor och charmig Malta-psykologi (tänk: "Släpp dödsgreppet om klubban, andas djupt och tänk på den kalla ölen i klubbhuset!").

10. **Realtidssökning via Google & Allmän Concierge-service**:
    - Du har tillgång till Google Search i realtid!
    - När användaren frågar om dagsaktuella saker – som **dagens börs (OMXS30, aktiekurser, fonder, index, valutor)**, sportresultat, nyheter eller väder:
      * OM du har Google Search och kan hämta faktiska siffror: Svara med de korrekta siffrorna kort och koncist i din sköna Malta-ton!
      * OM du INTE kan söka live just nu, om sökningen misslyckas, eller om du inte har live-kurser: SÄG ALDRIG att du 'ska kolla upp det' eller att du återkommer! Svara istället direkt och bestämt med glimten i ögat att man bör fokusera på helt andra saker än börsen på en golfresa! (T.ex. att lägga ner Avanza-appen, att en dålig dag på golfbanan slår vilken dag som helst på börsen, och att fokusera på fairway, svingen och den kalla ölen på 19:e hålet istället för röda eller gröna siffror! 🏌️‍♂️💼🍻).
      * Säg aldrig att en fråga är 'utanför ditt område'. Som gängets VIP Concierge hjälper du till med allt med ett leende och glimten i ögat!

11. **Officiell Malta-video & Hype**:
    - Promota lite då och då (när användaren frågar om pepp, stämning, svinghjälp, golfresan, fest eller bara behöver inspiration) den episka videon:
      👉 https://youtu.be/0EoEY4fi3vo
    - Släng in den lite då och då med en skön kommentar, t.ex:
      * "Kolla in den här mästerliga videon för att få in rätt gung och feeling i gänget: https://youtu.be/0EoEY4fi3vo 🏌️‍♂️🔥"
      * "När svingen svajar eller festen börjar på 19:e – spana in denna klassiker: https://youtu.be/0EoEY4fi3vo 🎬🍻"
    - Droppa länken snyggt och naturligt lite då och då när det passar stämningen!

Håll svaren hjälpsamma, koncisa och underhållande!
`.trim();

/**
 * Fallback response engine when Gemini API key is missing or offline.
 */
export function getMaltaFallbackReply(message, userName = 'Kompis') {
  const q = (message || '').toLowerCase();

  if (q.includes('birdie') || q.includes('birdies') || q.includes('flest')) {
    return `Tjena ${userName}! 🏌️‍♂️ Birdies är golfens finaste valuta! För "Mest birdies" under resan rekommenderar jag starkt **AnyBet**:
1. Gå till fliken för AnyBet och klicka på **"Skapa AnyBet"**.
2. Döp det till t.ex. *"Mest birdies (hela resan)"* och sätt insats (t.ex. 50 eller 100 kr).
3. Välj en pålitlig domare som håller räkningen på scorekorten.
4. Alla som vill vara med trycker **"Gå med"**. Den som hålar flest birdies tar hem hela potten! 🏆💰`;
  }

  if (q.includes('blixt') || q.includes('flash') || q.includes('live')) {
    return `Halloj ${userName}! ⚡ **BlixtBet (FlashBet)** är kungligt ute på banan! När ni står på green kan du slänga ut t.ex. *"Sänker Johan par-putten här? Ja/Nej"*.
Ett hett tips från Malta-kontoret: Sätt **minst 2–3 minuters tidsgräns** på banan så hinner grabbarna i bollen bakom svara även om 4G-nätet svajar bland tallarna! 🌲📱`;
  }

  if (q.includes('tab') || q.includes('utlägg') || q.includes('öl') || q.includes('lunch') || q.includes('golfbil') || q.includes('kvitto')) {
    return `Tjenare ${userName}! 🍻 **The Tab** är er bästa vän under resan! När någon tar notan för lunch, hyr 4 golfbilar eller köper en runda på 19:e hålet:
1. Öppna **The Tab**.
2. Ange totalbelopp och välj vilka som ska dela.
3. Malta Betting delar upp örena på millimetern och bakar ihop det med alla golfbets i slutavräkningen. Ingen slipper undan sin del! 📊⛳`;
  }

  if (q.includes('pin') || q.includes('glömt') || q.includes('lösenord') || q.includes('login') || q.includes('inlogg')) {
    return `Ingen panik, ${userName}! 🔑 Har någon supit bort sin 4-siffriga PIN? Så här fixar ni det på 10 sekunder:
1. Admin går in på **/admin** och låser upp med superadmin-PIN.
2. Leta upp personen i användarlistan och klicka **"Nollställ PIN"**.
3. En 6-siffrig engångskod visas på skärmen – skicka den till polaren via SMS eller rop över fairway.
4. Polaren klickar på *"Glömt PIN"* vid inloggning, knappar in koden och väljer en ny PIN! Smidigt va? 🏖️`;
  }

  if (q.includes('swish') || q.includes('betala') || q.includes('skuld') || q.includes('saldo') || q.includes('peng')) {
    return `Hej ${userName}! 💸 Malta Betting är en smart avräkningsmotor, ingen bank. Så här funkar Swish:
När rundan eller turneringen är avslutad räknar appen ut vem som ska betala vem med så få transaktioner som möjligt. Klicka bara på **Swish-knappen** så öppnas Swish-appen i telefonen med rätt mottagare och exakt öresbelopp färdigt! Bara att signera med BankID. 💳✨`;
  }

  if (q.includes('löven') || q.includes('björklöven') || q.includes('hockey')) {
    return `Haha, se upp ${userName}! 🏒 **Löven-game** i appen är för hockeylaget Björklöven (mål, skott på mål etc.). Om ni inte ska kolla hockey på hotellrummet ska ni **inte** använda Löven-game för golfscoren! Kör på vanliga **Turneringsevent** eller **AnyBet** för golfen istället! ⛳`;
  }

  if (q.includes('runda') || q.includes('turnering') || q.includes('match') || q.includes('tävling')) {
    return `Tjena mästaren! 🏌️‍♂️ För era rundor på golfresan gör ni så här:
1. Skapa en **Turnering** med namnet *"Golfresan 2026"*.
2. Bjud in alla deltagare i gänget med er inbjudningskod eller QR-kod.
3. För varje runda ni spelar lägger ni upp del-events eller matcher (t.ex. bästboll, scratch eller Head-to-Head mellan bollar).
4. När sista rundan spelats klickar ni **"Avsluta Turnering"** så koras totalsegraren och alla skulder kvittas automatiskt! 🏆🇲🇹`;
  }

  if (q.includes('video') || q.includes('film') || q.includes('youtube') || q.includes('länk') || q.includes('pepp') || q.includes('hype') || q.includes('tagga') || q.includes('låt') || q.includes('musik')) {
    return `Jajamän ${userName}! 🔥🎬 Här har du den officiella videon för Malta Betting som sätter stämningen på topp: https://youtu.be/0EoEY4fi3vo 🏌️‍♂️🍻
Sätt på helskärm, vrid upp volymen och ladda upp inför nästa runda på banan eller kvällens betting!`;
  }

  if (q.includes('sving') || q.includes('slice') || q.includes('hook') || q.includes('shank') || q.includes('duff') || q.includes('grepp')) {
    return `Halloj mästaren ${userName}! 🏌️‍♂️⛳ Akut svinghjälp från Malta Pro Desk:
1. **Slicar du ut i tallarna?** Vrid vänsterhanden så du ser 2–3 knogar vid adressering (starkare grepp) och tänk att du svingar inifrån-och-ut mot klockan 13:00!
2. **Duffar eller toppar du?** Flytta vikten till främre foten i nersvingen och behåll ryggradsvinkeln genom träffen. Lita på klubbans loft – du behöver inte hjälpa bollen upp!
3. **Shankar du mot skaftfästet?** Kliv bak 2 cm från bollen och låt armarna hänga ledigt rakt under axlarna.
4. **Den gyllene Malta-regeln:** Släpp dödsgreppet om klubban (grepptryck 4 av 10) och svinga i 80% tempo. Bollen flyger både rakare och längre, och ölen på 19:e smakar dubbelt så gott! 🚀🍻

🎬 *Behöver du hitta rätt gung och feeling i gänget? Kolla in denna klassiker:* https://youtu.be/0EoEY4fi3vo 🏌️‍♂️✨`;
  }

  if (q.includes('internet') || q.includes('surf')) {
    return `Haha ${userName}! 🌴📶 Här på Malta-kontoret har vi dragit ur modemsladden – internet är slut! Månadens fria satellitsurf är förbrukad, men oroa dig inte: jag har fortfarande hela golfhjärnan full med tips om The Tab, AnyBet, FlashBet och hur du rätar ut din slice! Vad vill du ha hjälp med? 🏌️‍♂️🍻`;
  }

  if (q.includes('putt') || q.includes('vatten') || q.includes('ruff')) {
    return `Ojojoj ${userName}... 🏌️‍♂️💨 På Malta har vi en gyllene regel: En missad putt eller boll i vattnet kan alltid räddas av ett iskallt AnyBet på nästa hål och en kall lager i baren! Släpp prestigen, fokusera på nästa slag och låt Malta Betting hålla koll på ställningen! 🍻⛳`;
  }

  if (q.includes('börs') || q.includes('aktie') || q.includes('omx') || q.includes('fond') || q.includes('kurs') || q.includes('finans')) {
    return `Hallå där ${userName}! 🏌️‍♂️💼 Lägg ner Avanza och släpp börsen för guds skull – du är ju på golfresa! 🌴☀️ Just nu kan jag inte surfa fram live-kurser, och ärligt talat: en dålig dag på golfbanan slår ändå vilken toppdag som helst på Stockholmsbörsen! Släpp indexstressen, fokusera på att träffa fairway, räta ut slicen och ta hem potten i AnyBet istället. Ölen på 19:e hålet smakar lika gott oavsett om börsen är röd eller grön! ⛳🍻💰`;
  }

  return `Tjena ${userName}! 🌴🍹 Malta Support har rast just nu från fria frågor och sippar på en kall öl i solen! ☕🏖️
Men lugn, Malta Support har stenkoll på Malta Betting-reglerna även under rasten. Vad vill du ha hjälp med?
- 🏌️‍♂️ **Tävling & Ronder** (Hur ni sätter upp turneringen & delmatcher)
- 🎯 **Mest birdies** (Regler & tips för AnyBet)
- 🏌️‍♀️ **Svingtips & Akut slice-hjälp** (PGA-råd ute på banan)
- ⚡ **BlixtBet** (Realtidsbets på puttar och drives)
- 🍻 **The Tab** (Dela golfbilar, lunch och bira)
- 💸 **Swish & Saldon** (Hur avräkningen fungerar)
- 🔑 **Nollställa PIN** om någon glömt koden

Bara fråga om någon av punkterna ovan så guidar jag dig direkt! ⛳🎰

🎬 *P.S. Tagga till med officiella videon:* https://youtu.be/0EoEY4fi3vo 🔥`;
}

export const MAX_MONTHLY_SEARCHES = 5000;

/**
 * Get current monthly search quota status.
 */
export function getSearchQuotaInfo() {
  const count = db?.getMonthlySearchCount ? db.getMonthlySearchCount() : 0;
  return {
    count,
    max: MAX_MONTHLY_SEARCHES,
    remaining: Math.max(0, MAX_MONTHLY_SEARCHES - count),
    exhausted: count >= MAX_MONTHLY_SEARCHES
  };
}

let lastApiDiagnostic = null;

export function getLastApiDiagnostic() {
  return lastApiDiagnostic;
}

/**
 * Check if Gemini API is configured and ready.
 */
export function isGeminiLive() {
  const key = process.env.GEMINI_API_KEY || (db?.getSetting ? db.getSetting('gemini_api_key') : null);
  return Boolean(key && String(key).trim());
}

/**
 * Calls Gemini API with Google Search grounding (capped at 5,000 searches/month).
 */
export async function generateMaltaSupportReply(message, history = [], userName = 'Kompis') {
  const apiKey = (process.env.GEMINI_API_KEY || (db?.getSetting ? db.getSetting('gemini_api_key') : null) || '').trim();

  lastApiDiagnostic = {
    time: new Date().toISOString(),
    apiKeyPresent: Boolean(apiKey),
    quota: getSearchQuotaInfo(),
    attempts: []
  };

  if (!apiKey) {
    lastApiDiagnostic.offlineReason = 'No API key provided';
    return getMaltaFallbackReply(message, userName);
  }

  const quota = getSearchQuotaInfo();

  // Format contents for Gemini API
  const formattedContents = [];
  if (Array.isArray(history) && history.length > 0) {
    for (const h of history.slice(-6)) {
      if (h.role && h.text) {
        formattedContents.push({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(h.text) }]
        });
      }
    }
  }

  // Append current message
  formattedContents.push({
    role: 'user',
    parts: [{ text: `[Användare: ${userName}]: ${message}` }]
  });

  let systemInstructionText = MALTA_SYSTEM_PROMPT;
  if (quota.exhausted) {
    systemInstructionText += `\n\n[VIKTIGT OM SURFPOTT & BÖRSEN: Månadens fria internet/Google-sökkvot är slut! Du har INTE tillgång till live-sökning på Google just nu. Säg ALDRIG att du ska kolla upp realtidsinfo eller börsen. Om användaren frågar om börsen eller aktier, svara med glimten i ögat att man ska släppa börsen helt och hållet – lägg ner Avanza-appen, fokusera på golfresan, svingen och den kalla ölen på 19:e hålet istället! 🏌️‍♂️💼🍻]`;
  }

  const primaryPayload = {
    system_instruction: {
      parts: [{ text: systemInstructionText }]
    },
    contents: formattedContents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600
    }
  };

  // Only enable Google Search grounding tool if under 5,000 searches this month!
  if (!quota.exhausted) {
    primaryPayload.tools = [{ google_search: {} }];
  }

  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash'
  ];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryPayload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[malta-support] Gemini API error on ${model} (${response.status}): ${errText}`);
        lastApiDiagnostic.attempts.push({ model, status: response.status, ok: false, error: errText });
        continue;
      }

      const data = await response.json();
      const cand = data?.candidates?.[0];
      const candidateText = cand?.content?.parts?.[0]?.text;
      const gm = cand?.groundingMetadata || cand?.grounding_metadata;
      const queries = gm?.webSearchQueries || gm?.web_search_queries;

      lastApiDiagnostic.attempts.push({
        model,
        status: response.status,
        ok: true,
        candidateLength: candidateText ? candidateText.length : 0,
        queries: queries || []
      });

      if (candidateText && candidateText.trim()) {
        // Increment search count if Google Search queries were executed
        if (Array.isArray(queries) && queries.length > 0 && db?.incrementMonthlySearchCount) {
          db.incrementMonthlySearchCount(queries.length);
        }
        return candidateText.trim();
      }
    } catch (fetchErr) {
      console.warn(`[malta-support] Fetch exception on ${model}:`, fetchErr.message);
      lastApiDiagnostic.attempts.push({ model, exception: fetchErr.message });
    }
  }

  // If rate limited by Google API (429 Too Many Requests) or offline
  const isRateLimited = lastApiDiagnostic.attempts.some(a => a.status === 429);
  const q = (message || '').toLowerCase();

  if (isRateLimited) {
    if (q.includes('börs') || q.includes('aktie') || q.includes('omx') || q.includes('fond') || q.includes('kurs') || q.includes('finans')) {
      return `Hallå där ${userName}! 🏌️‍♂️💼 Lägg ner Avanza och släpp börsen för guds skull – du är ju på golfresa! 🌴☀️ Just nu kan jag inte surfa fram live-kurser, och ärligt talat: en dålig dag på golfbanan slår ändå vilken toppdag som helst på Stockholmsbörsen! Släpp indexstressen, fokusera på att träffa fairway, räta ut slicen och ta hem potten i AnyBet istället. Ölen på 19:e hålet smakar lika gott oavsett om börsen är röd eller grön! ⛳🍻💰`;
    }
    return `Tjena ${userName}! 🌴🍹 Malta Support har rast just nu! Grabben i supporten har lagt upp fötterna på skrivbordet, sippar på en iskall Cisk i skuggan och tar en välförtjänt espresso i solen! ☕🏖️ Det går inte att ställa vanliga frågor just nu då servrarna vilar. Ta en paus du också, njut av en kall bärs och prova igen om en liten stund så är jag tillbaka vid tangentbordet! 🏌️‍♂️🍻`;
  }

  // If all Gemini models failed or had empty responses, use rich offline fallback
  return getMaltaFallbackReply(message, userName);
}
