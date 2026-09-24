// ── Malta AI Support Engine (VIP Concierge & Betting Specialist) ──
// Provides intelligent AI responses for BetPals via Gemini API with a rich offline fallback.

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

  if (q.includes('putt') || q.includes('slice') || q.includes('duff') || q.includes('vatten') || q.includes('ruff')) {
    return `Ojojoj ${userName}... 🏌️‍♂️💨 Slicade någon ut i skogen igen? På Malta har vi en gyllene regel: En dålig drive kan alltid räddas av en iskall öl i baren och ett välplacerat AnyBet på nästa hål! Släpp prestigen, fokusera på nästa putt och låt BetPals hålla koll på insatserna! 🍻`;
  }

  return `Morn morn ${userName}! 🇲🇹 Solen skiner över St. Julian's och Malta Support står redo!
Hur kan jag hjälpa dig med golfresan och era rundor idag?
- 🏌️‍♂️ **Tävling & Ronder** (Hur ni sätter upp turneringen & rundorna)
- 🎯 **Mest birdies** (Tips för AnyBet-potter)
- ⚡ **BlixtBet** (Realtidsbets på puttar och drives)
- 🍻 **The Tab** (Dela golfbilar, lunch och bira)
- 💸 **Swish & Saldon** (Hur avräkningen fungerar)
- 🔑 **Nollställa PIN** om någon glömt koden

Bara fråga på så guidar jag dig direkt! ⛳🎰`;
}

/**
 * Calls Gemini API if GEMINI_API_KEY is available, otherwise uses smart fallback.
 */
export async function generateMaltaSupportReply(message, history = [], userName = 'Kompis') {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return getMaltaFallbackReply(message, userName);
  }

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const payload = {
    systemInstruction: {
      parts: [{ text: MALTA_SYSTEM_PROMPT }]
    },
    contents: formattedContents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 600
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.warn(`[malta-support] Gemini API error (${response.status}): ${errText}`);
    return getMaltaFallbackReply(message, userName);
  }

  const data = await response.json();
  const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!candidateText || !candidateText.trim()) {
    return getMaltaFallbackReply(message, userName);
  }

  return candidateText.trim();
}
