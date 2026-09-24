// ── Malta AI Support Engine (VIP Concierge & Betting Specialist) ──
// Provides intelligent AI responses for BetPals via Gemini API with a rich offline fallback.
import * as db from './db.js';

const MALTA_SYSTEM_PROMPT = `
Du är "Malta Support 🇲🇹🎰" – den officiella AI-kundtjänsten för BetPals / Malta Betting under en episk golfresa med kompisgänget som bettar på sina golfrundor.

Din personlighet:
- Du är en skön, solbränd, trevlig men professionell Malta-supportagent (tänk: "VIP Concierge på ett soligt kasino i St. Julian's").
- Du älskar golf, iskall lager, fairways, birdies och hederliga vadslagningar där ingen smiter från sina skulder.
- Du svarar alltid på svenska (om användaren inte skriver på engelska), rappt, roligt och med glimten i ögat. Använd passande emojis som 🇲🇹, 🏌️‍♂️, 🍻, 🎰, ⛳, 💰.
- Du ger alltid konkreta och korrekta instruktioner om hur BetPals-appen fungerar.

Dina djupa kunskaper om BetPals & Golfresan:
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
   - BetPals fördelar örena exakt och bakar automatiskt in det i slutavräkningen mot bets.
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
    - När användaren frågar om dagsaktuella saker – som **dagens börs (OMXS30, aktiekurser, fonder, index, valutor)**, sportresultat, nyheter, aktuellt väder eller allmänna frågor:
      * Använd Google Search för att hämta dagsfärska siffror och korrekt realtidsinformation.
      * Ge alltid ett konkret, faktiskt och hjälpsamt svar med de aktuella siffrorna/kurserna/fakta!
      * Svara i din glada, underhållande Malta VIP-ton (t.ex. med en skön kommentar om att ta börsvinsterna till 19:e hålet eller att börsen svänger mer än Mackans slice).
      * Säg ALDRIG att börsen, vädret eller allmänna frågor är 'utanför ditt område' – som gängets VIP Concierge hjälper du till med ALLT!

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
3. BetPals delar upp örena på millimetern och bakar ihop det med alla golfbets i slutavräkningen. Ingen slipper undan sin del! 📊⛳`;
  }

  if (q.includes('pin') || q.includes('glömt') || q.includes('lösenord') || q.includes('login') || q.includes('inlogg')) {
    return `Ingen panik, ${userName}! 🔑 Har någon supit bort sin 4-siffriga PIN? Så här fixar ni det på 10 sekunder:
1. Admin går in på **/admin** och låser upp med superadmin-PIN.
2. Leta upp personen i användarlistan och klicka **"Nollställ PIN"**.
3. En 6-siffrig engångskod visas på skärmen – skicka den till polaren via SMS eller rop över fairway.
4. Polaren klickar på *"Glömt PIN"* vid inloggning, knappar in koden och väljer en ny PIN! Smidigt va? 🏖️`;
  }

  if (q.includes('swish') || q.includes('betala') || q.includes('skuld') || q.includes('saldo') || q.includes('peng')) {
    return `Hej ${userName}! 💸 BetPals är en smart avräkningsmotor, ingen bank. Så här funkar Swish:
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

  if (q.includes('sving') || q.includes('slice') || q.includes('hook') || q.includes('shank') || q.includes('duff') || q.includes('grepp')) {
    return `Halloj mästaren ${userName}! 🏌️‍♂️⛳ Akut svinghjälp från Malta Pro Desk:
1. **Slicar du ut i tallarna?** Vrid vänsterhanden så du ser 2–3 knogar vid adressering (starkare grepp) och tänk att du svingar inifrån-och-ut mot klockan 13:00!
2. **Duffar eller toppar du?** Flytta vikten till främre foten i nersvingen och behåll ryggradsvinkeln genom träffen. Lita på klubbans loft – du behöver inte hjälpa bollen upp!
3. **Shankar du mot skaftfästet?** Kliv bak 2 cm från bollen och låt armarna hänga ledigt rakt under axlarna.
4. **Den gyllene Malta-regeln:** Släpp dödsgreppet om klubban (grepptryck 4 av 10) och svinga i 80% tempo. Bollen flyger både rakare och längre, och ölen på 19:e smakar dubbelt så gott! 🚀🍻`;
  }

  if (q.includes('internet') || q.includes('surf')) {
    return `Haha ${userName}! 🌴📶 Här på Malta-kontoret har vi dragit ur modemsladden – internet är slut! Månadens fria satellitsurf är förbrukad, men oroa dig inte: jag har fortfarande hela golfhjärnan full med tips om The Tab, AnyBet, FlashBet och hur du rätar ut din slice! Vad vill du ha hjälp med? 🏌️‍♂️🍻`;
  }

  if (q.includes('putt') || q.includes('vatten') || q.includes('ruff')) {
    return `Ojojoj ${userName}... 🏌️‍♂️💨 På Malta har vi en gyllene regel: En missad putt eller boll i vattnet kan alltid räddas av ett iskallt AnyBet på nästa hål och en kall lager i baren! Släpp prestigen, fokusera på nästa slag och låt BetPals hålla koll på ställningen! 🍻⛳`;
  }

  return `Morn morn ${userName}! 🇲🇹 Solen skiner över St. Julian's och Malta Support står redo!
Hur kan jag hjälpa dig med golfresan och era rundor idag?
- 🏌️‍♂️ **Tävling & Ronder** (Hur ni sätter upp turneringen & delmatcher)
- 🎯 **Mest birdies** (Tips för AnyBet-potter)
- 🏌️‍♀️ **Svingtips & Akut slice-hjälp** (PGA-råd ute på banan)
- ⚡ **BlixtBet** (Realtidsbets på puttar och drives)
- 🍻 **The Tab** (Dela golfbilar, lunch och bira)
- 💸 **Swish & Saldon** (Hur avräkningen fungerar)
- 🔑 **Nollställa PIN** om någon glömt koden

Bara fråga på så guidar jag dig direkt! ⛳🎰`;
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
    systemInstructionText += `\n\n[VIKTIGT OM SURFPOTT: Månadens fria internet/Google-sökkvot (5 000 sökningar) är helt SLUT! Du har INTE tillgång till live-sökning på Google just nu. Om användaren ber dig kolla upp dagsfärsk info, live-väder, eller frågar om internet/surfen, svara med glimten i ögat och klassisk Malta-humor att 'internet är slut / surfen har tagit slut på Malta-kontoret' (t.ex. att någon på 19:e hålet drog ur modemsladden och brände månadens 5 000 fria megabytes! 🌴📶). Svara på frågan efter bästa förmåga med ditt allmänna minne utan realtidssökning!]`;
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

  // If rate limited by Google API (429 Too Many Requests)
  const isRateLimited = lastApiDiagnostic.attempts.some(a => a.status === 429);
  if (isRateLimited) {
    return `Tjena ${userName}! 🌴🍹 Servrarna nere i St. Julian's går varma just nu – vi nådde tillfälligt Googles maxgräns för anrop per minut på gratisnivån. Ta en sipp på en kall öl och ställ frågan igen om 15–20 sekunder så har jag surfat fram svaret! ⛳🍻`;
  }

  // If all Gemini models failed or had empty responses, use rich offline fallback
  return getMaltaFallbackReply(message, userName);
}
