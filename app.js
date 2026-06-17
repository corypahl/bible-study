const readings = window.ST_MARTHA_READINGS;
const bookCache = new Map();
const passageCache = new Map();
let availableVoices = [];
let activeSpeechButton = null;
let activeUtterance = null;

const bookMap = {
  "1 Cor": "1-corinthians",
  "1 John": "1-john",
  "1 Kgs": "3-kings",
  "1 Peter": "1-peter",
  "1 Sam": "1-kings",
  "1 Thess": "1-thessalonians",
  "2 Cor": "2-corinthians",
  "2 Kgs": "4-kings",
  "2 Pet": "2-peter",
  "2 Sam": "2-kings",
  "2 Tim": "2-timothy",
  "Acts": "acts",
  "Col": "colossians",
  "Deut": "deuteronomy",
  "Dn": "daniel",
  "Ezek": "ezechiel",
  "Exod": "exodus",
  "Eph": "ephesians",
  "Gen": "genesis",
  "Hos": "osee",
  "Isa": "isaie",
  "Jer": "jeremie",
  "John": "john",
  "Lev": "leviticus",
  "Luke": "luke",
  "Mal": "malachie",
  "Mark": "mark",
  "Matt": "matthew",
  "Phil": "philippians",
  "Prov": "proverbs",
  "Ps": "psalms",
  "Rev": "apocalypse",
  "Rom": "romans",
  "Sir": "ecclesiasticus",
  "Wis": "wisdom",
  "Zeph": "sophonias",
  "Zech": "zacharias"
};

const elements = {
  select: document.querySelector("#weekSelect"),
  voiceSelect: document.querySelector("#voiceSelect"),
  liturgicalDate: document.querySelector("#liturgicalDate"),
  title: document.querySelector("#weekTitle"),
  theme: document.querySelector("#weekTheme"),
  readingsList: document.querySelector("#readingsList"),
  reflection: document.querySelector("#reflectionText"),
  discussion: document.querySelector("#discussionList"),
  prayer: document.querySelector("#prayerText"),
  officialLink: document.querySelector("#officialLink"),
  decreaseTextSize: document.querySelector("#decreaseTextSize"),
  increaseTextSize: document.querySelector("#increaseTextSize")
};

const preferredVoiceTerms = [
  "natural",
  "premium",
  "enhanced",
  "neural",
  "samantha",
  "ava",
  "allison",
  "susan",
  "victoria",
  "google us english",
  "microsoft aria",
  "microsoft jenny",
  "microsoft mark",
  "microsoft zira"
];

const defaultVoiceLang = "en-US";
const textSizeStorageKey = "stMarthaTextSize";
const defaultTextScale = 1;
const minTextScale = 0.88;
const maxTextScale = 1.36;
const textScaleStep = 0.08;

function normalizeVoiceLang(lang) {
  return String(lang || "").replace("_", "-").toLowerCase();
}

function isDefaultVoiceLang(voice) {
  return normalizeVoiceLang(voice.lang) === normalizeVoiceLang(defaultVoiceLang);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStoredTextScale() {
  const savedScale = Number(localStorage.getItem(textSizeStorageKey));
  return Number.isFinite(savedScale) ? clamp(savedScale, minTextScale, maxTextScale) : defaultTextScale;
}

function setTextScale(scale) {
  const nextScale = clamp(Number(scale.toFixed(2)), minTextScale, maxTextScale);
  document.documentElement.style.setProperty("--study-font-scale", String(nextScale));
  localStorage.setItem(textSizeStorageKey, String(nextScale));

  if (elements.decreaseTextSize) {
    elements.decreaseTextSize.disabled = nextScale <= minTextScale;
  }

  if (elements.increaseTextSize) {
    elements.increaseTextSize.disabled = nextScale >= maxTextScale;
  }
}

function adjustTextScale(direction) {
  const currentScale = getStoredTextScale();
  setTextScale(currentScale + (direction * textScaleStep));
}

function formatDisplayDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function findDefaultIndex() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = readings.findIndex((week) => new Date(`${week.date}T00:00:00`) >= today);
  return next === -1 ? readings.length - 1 : next;
}

function populateSelect() {
  readings.forEach((week, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${formatDisplayDate(week.date)} - ${week.title}`;
    elements.select.append(option);
  });
}

function scoreVoice(voice) {
  const name = voice.name.toLowerCase();
  const lang = normalizeVoiceLang(voice.lang);
  let score = 0;

  if (lang.startsWith("en-us")) {
    score += 8;
  } else if (lang.startsWith("en")) {
    score += 5;
  }

  preferredVoiceTerms.forEach((term, index) => {
    if (name.includes(term)) {
      score += 20 - index;
    }
  });

  if (voice.localService) {
    score += 1;
  }

  return score;
}

function getVoiceId(voice) {
  return `${voice.name}::${voice.lang}`;
}

function getBestVoice() {
  const englishUsVoices = availableVoices.filter(isDefaultVoiceLang);
  const englishVoices = availableVoices.filter((voice) => normalizeVoiceLang(voice.lang).startsWith("en"));
  return (englishUsVoices.length ? englishUsVoices : englishVoices)
    .sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

function populateVoiceSelect() {
  if (!("speechSynthesis" in window) || !elements.voiceSelect) {
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    return;
  }

  availableVoices = voices;
  const bestVoice = getBestVoice();

  elements.voiceSelect.innerHTML = "";
  const englishUsVoices = availableVoices.filter(isDefaultVoiceLang);
  const englishVoices = availableVoices.filter((voice) => normalizeVoiceLang(voice.lang).startsWith("en"));
  const displayedVoices = englishUsVoices.length ? englishUsVoices : englishVoices;
  const savedVoiceId = localStorage.getItem("stMarthaVoice");
  const savedVoiceIsDisplayed = displayedVoices.some((voice) => getVoiceId(voice) === savedVoiceId);
  const selectedVoice = savedVoiceIsDisplayed ? savedVoiceId : (bestVoice ? getVoiceId(bestVoice) : "");

  displayedVoices
    .sort((a, b) => scoreVoice(b) - scoreVoice(a) || a.name.localeCompare(b.name))
    .forEach((voice) => {
      const option = document.createElement("option");
      option.value = getVoiceId(voice);
      option.textContent = `${voice.name} (${voice.lang})`;
      elements.voiceSelect.append(option);
    });

  if (!elements.voiceSelect.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default voice";
    elements.voiceSelect.append(option);
  }

  elements.voiceSelect.value = [...elements.voiceSelect.options].some((option) => option.value === selectedVoice)
    ? selectedVoice
    : elements.voiceSelect.options[0].value;
}

function getSelectedVoice() {
  const voiceId = elements.voiceSelect ? elements.voiceSelect.value : "";
  return availableVoices.find((voice) => getVoiceId(voice) === voiceId) || getBestVoice();
}

function compactQuestions(questions) {
  return questions.filter(Boolean).map((question) => question.trim());
}

function normalizeDiscussionTopic(topic) {
  if (Array.isArray(topic.questions)) {
    return {
      ...topic,
      questions: compactQuestions(topic.questions)
    };
  }

  return {
    ...topic,
    questions: compactQuestions([topic.question])
  };
}

const discussionScenarios = [
  {
    terms: ["fear", "courage", "hidden"],
    anchor: "Jeremiah faces pressure, Paul names grace, and Jesus tells the disciples not to fear.",
    action: "truthful courage",
    personal: "I know a hard truth should be said, but I want to stay quiet to avoid conflict",
    work: "a meeting or message thread where people know something is wrong but nobody wants to name it",
    family: "a child, spouse, or friend needs calm truth instead of either silence or a sharp correction"
  },
  {
    terms: ["welcom", "hospitality", "cup of cold water"],
    anchor: "The Shunammite woman makes room for the prophet, and Jesus notices even a cup of cold water.",
    action: "concrete hospitality",
    personal: "I am interrupted by someone who needs attention when I wanted convenience",
    work: "a newer, quieter, or difficult person is easy to overlook because they slow things down",
    family: "our home could make room for someone through a meal, invitation, ride, or patient attention"
  },
  {
    terms: ["weary", "rest", "yoke", "burden"],
    anchor: "Jesus invites the weary to take his yoke and learn from his meek and humble heart.",
    action: "resting in Christ instead of carrying everything alone",
    personal: "I am tired but keep acting as if every problem depends on me",
    work: "I am measuring my worth by output, availability, or keeping everyone satisfied",
    family: "our schedule is so full that prayer, patience, and unhurried presence get squeezed out"
  },
  {
    terms: ["seed", "soil", "word"],
    anchor: "Isaiah says God's word does not return empty, and Jesus describes the soil that receives it.",
    action: "becoming better soil for God's word",
    personal: "I hear something true at Mass but quickly let distraction, worry, or resentment crowd it out",
    work: "good counsel or correction is given, but busyness makes it easy to dismiss",
    family: "our home has noise, screens, or habits that make it hard for the word of God to take root"
  },
  {
    terms: ["weeds", "wheat", "patient", "slow growth"],
    anchor: "Jesus' parable of the weeds and wheat shows a God who is patient while growth is still mixed.",
    action: "patient correction without rushing to judge",
    personal: "I see mixed motives in myself and want either to excuse everything or condemn everything",
    work: "a coworker or leader is frustrating, but the full story may not be visible yet",
    family: "a child or spouse is growing slowly, and I need to distinguish patience from ignoring a problem"
  },
  {
    terms: ["wisdom", "treasure", "pearl", "understanding heart"],
    anchor: "Solomon asks for an understanding heart, and Jesus compares the kingdom to treasure.",
    action: "choosing the treasure that lasts",
    personal: "my time, money, or attention shows that a lesser treasure is becoming too important",
    work: "a career decision offers status or comfort but could cost integrity, peace, or family presence",
    family: "our calendar or spending reveals what our home treats as treasure"
  },
  {
    terms: ["feed", "bread", "eucharist", "scarcity", "abundance", "body and blood"],
    anchor: "God feeds his people in the desert, and Jesus gives bread that becomes a sign of abundance.",
    action: "trusting God's abundance",
    personal: "I assume there is not enough time, patience, money, or love, so I become protective",
    work: "limited resources create a temptation to compete, hoard credit, or dismiss someone else's need",
    family: "we feel stretched thin and need to bring the little we have to Jesus instead of snapping at each other"
  },
  {
    terms: ["quiet", "whisper", "sinking", "storm"],
    anchor: "Elijah hears God in quiet, and Peter sinks when fear pulls his eyes from Jesus.",
    action: "listening for Christ in fear and noise",
    personal: "anxiety is loud enough that I stop praying and start rehearsing worst-case scenarios",
    work: "pressure or conflict makes me react quickly before listening for the right next step",
    family: "a tense moment at home needs a quieter response before anyone can hear truth"
  },
  {
    terms: ["outsider", "foreign", "mercy reaches", "boundaries", "canaanite"],
    anchor: "Isaiah sees outsiders brought near, and Jesus praises persistent faith beyond expected boundaries.",
    action: "welcoming mercy beyond my usual circle",
    personal: "I quietly decide who is worth my time, patience, or attention",
    work: "someone outside the usual group needs inclusion, advocacy, or a fair hearing",
    family: "our family habits could make a neighbor, classmate, or parish family feel more welcomed"
  },
  {
    terms: ["who he is", "confession", "christ, the son", "keys"],
    anchor: "Peter answers Jesus plainly: you are the Christ, the Son of the living God.",
    action: "living from a clear answer about Jesus",
    personal: "I know the right words about Jesus but hesitate to let that answer shape a decision",
    work: "faith is treated as private, so I avoid letting Christian conviction influence my conduct",
    family: "our children see many priorities, and we need our home to make our answer about Jesus visible"
  },
  {
    terms: ["cross", "suffering", "deny himself"],
    anchor: "Jesus says disciples must take up the cross and follow him.",
    action: "accepting sacrificial love with trust",
    personal: "I meet an inconvenience and immediately look for a way around sacrifice",
    work: "doing the right thing costs comfort, approval, or efficiency",
    family: "love requires a hidden sacrifice that nobody may thank me for"
  },
  {
    terms: ["correction", "reconciliation", "speak", "addressing hurt"],
    anchor: "Jesus gives a path for addressing hurt with truth, charity, and the hope of reconciliation.",
    action: "honest correction ordered toward peace",
    personal: "I am tempted to vent about someone instead of speaking with them directly and charitably",
    work: "a conflict needs a clear conversation rather than gossip, avoidance, or public embarrassment",
    family: "an apology or correction is needed, and tone will decide whether it heals or hardens"
  },
  {
    terms: ["forgive", "forgiven", "seventy", "keeping score"],
    anchor: "Jesus' parable warns forgiven people not to keep score with others.",
    action: "forgiving without pretending the wound was small",
    personal: "I replay an old hurt and use it to justify coldness or distance",
    work: "someone made a mistake, and I can either punish them socially or help repair the damage",
    family: "a repeated irritation needs mercy, boundaries, and a choice not to keep a running account"
  },
  {
    terms: ["generosity", "fairness", "vineyard workers"],
    anchor: "Jesus shows that God's generosity is larger than our calculations of fairness.",
    action: "receiving generosity without resentment",
    personal: "someone else receives attention, praise, or opportunity and I feel cheated",
    work: "a coworker gets grace, flexibility, or recognition that I think should have been mine",
    family: "one child or spouse needs extra mercy, and fairness cannot mean treating every need identically"
  },
  {
    terms: ["direction of the heart", "first says no", "repentance", "humility"],
    anchor: "The son who first says no but later obeys shows that repentance matters more than appearances.",
    action: "turning back with humility",
    personal: "my first reaction was defensive or selfish, but I still have a chance to turn back",
    work: "I need to admit a mistake before protecting my image makes it worse",
    family: "a parent can model repentance by returning to a conversation with humility"
  },
  {
    terms: ["fruit", "vineyard", "gifts", "talents", "buried"],
    anchor: "The vineyard and talents readings ask whether God's gifts are bearing fruit or being buried.",
    action: "using entrusted gifts for God",
    personal: "fear of failure keeps me from using a gift, time, or responsibility faithfully",
    work: "I am tempted to do the minimum instead of stewarding influence, skill, or authority well",
    family: "our family has gifts that could serve someone, but comfort keeps them unused"
  },
  {
    terms: ["feast", "readiness", "watchful", "advent", "stay awake"],
    anchor: "The readings call us to readiness: the Lord comes, and the heart must stay awake.",
    action: "watchful readiness",
    personal: "I drift through the week spiritually asleep, reacting to whatever is urgent",
    work: "constant tasks make it easy to lose sight of who I am becoming",
    family: "our home can prepare for the Lord through a simple habit rather than just more activity"
  },
  {
    terms: ["public life", "money", "loyalty", "caesar"],
    anchor: "Jesus teaches that everything, including money and public life, belongs under God.",
    action: "giving God what bears his image",
    personal: "a financial, political, or reputation concern starts claiming more loyalty than God",
    work: "policy, profit, or pressure conflicts with conscience",
    family: "our spending, speech, or media habits teach what we really think belongs to God"
  },
  {
    terms: ["love of god", "love of neighbor", "inseparable"],
    anchor: "Jesus joins love of God and love of neighbor as the center of the law.",
    action: "uniting worship and concrete love",
    personal: "I want prayer without the inconvenience of loving the person in front of me",
    work: "a difficult person needs respect, patience, or justice from me",
    family: "love of God should change how we speak when everyone is tired"
  },
  {
    terms: ["hungry", "thirsty", "stranger", "sick", "imprisoned"],
    anchor: "Christ the King identifies himself with the hungry, thirsty, stranger, sick, and imprisoned.",
    action: "serving Christ in the vulnerable",
    personal: "I pass by a need because it feels inconvenient, complicated, or outside my responsibility",
    work: "a vulnerable person is treated like a problem to manage instead of a person to honor",
    family: "our family can choose one concrete act of mercy for someone who is overlooked"
  },
  {
    terms: ["saints", "beatitudes", "holiness", "holy family"],
    anchor: "The readings show holiness in ordinary virtues: mercy, purity, patience, reverence, and peace.",
    action: "ordinary holiness",
    personal: "I treat holiness as dramatic instead of practicing one small virtue today",
    work: "I can choose integrity, mercy, or peacemaking in a situation nobody will notice",
    family: "home becomes the first place to practice patience, gratitude, forgiveness, and reverence"
  },
  {
    terms: ["epiphany", "light", "magi", "seek"],
    anchor: "The magi notice the light, seek Christ, and worship when they find him.",
    action: "seeking Christ before lesser treasures",
    personal: "a lesser goal is getting my best attention while prayer gets leftovers",
    work: "success, recognition, or advancement starts becoming the star I follow",
    family: "our home can show that worship comes before activity, achievement, and hurry"
  },
  {
    terms: ["baptism", "beloved", "jordan"],
    anchor: "At the Jordan, the Father names Jesus as beloved and the Spirit descends.",
    action: "living from baptismal identity",
    personal: "I act as if my worth depends on performance instead of being beloved in Christ",
    work: "criticism or praise starts defining me more than my identity in God",
    family: "our children need to see parents live from belovedness, not anxiety or comparison"
  },
  {
    terms: ["lamb of god", "point", "recognize"],
    anchor: "John the Baptist recognizes Jesus and points away from himself toward the Lamb of God.",
    action: "humble witness",
    personal: "I want credit for something that should point people to Christ",
    work: "I can redirect praise, influence, or attention toward truth instead of self-promotion",
    family: "parents can help children notice Jesus without making faith feel like a performance"
  },
  {
    terms: ["follow", "fishers", "called"],
    anchor: "Jesus calls ordinary people in ordinary work to follow him and share his mission.",
    action: "prompt discipleship",
    personal: "I sense a nudge to pray, serve, apologize, or change, but I keep delaying",
    work: "daily work becomes a place of mission instead of just obligation",
    family: "our family can answer one concrete call instead of waiting for life to be less busy"
  },
  {
    terms: ["salt", "works of mercy"],
    anchor: "Isaiah names concrete mercy, and Jesus calls disciples salt and light.",
    action: "visible mercy",
    personal: "my faith stays hidden because visible mercy would cost time or comfort",
    work: "someone needs practical help, not just kind thoughts",
    family: "we can choose one work of mercy that lets our light shine without showing off"
  },
  {
    terms: ["converted heart", "anger", "oath", "external rules"],
    anchor: "Jesus moves beyond external rule-keeping to anger, desire, speech, and the heart.",
    action: "conversion beneath the surface",
    personal: "I look compliant but carry resentment, contempt, or careless speech inside",
    work: "tone, sarcasm, or exaggeration damages trust even when the facts are technically right",
    family: "the way we speak at home reveals whether peace is only external or truly rooted"
  },
  {
    terms: ["enemy", "revenge", "getting even"],
    anchor: "Jesus commands love of enemies and freedom from revenge.",
    action: "mercy with real boundaries",
    personal: "I want the satisfaction of being right more than the freedom of mercy",
    work: "a difficult person tempts me to retaliate through silence, sarcasm, or exclusion",
    family: "we need to teach mercy while still naming harm and setting boundaries"
  },
  {
    terms: ["temptation", "desert", "lies"],
    anchor: "Jesus resists temptation in the desert by trusting the Father and God's word.",
    action: "rejecting the lie and choosing trust",
    personal: "I am tempted to prove myself, comfort myself, or control outcomes apart from God",
    work: "pressure makes a shortcut, half-truth, or image-management feel reasonable",
    family: "a stressful day tempts us to reach for distraction instead of prayerful honesty"
  },
  {
    terms: ["transfiguration", "promise", "listen", "mountain"],
    anchor: "Abram follows before seeing the whole road, and the disciples hear: listen to him.",
    action: "trusting God's next step",
    personal: "I want certainty before obedience, but God may be giving only the next step",
    work: "a decision requires integrity before the outcome is clear",
    family: "our family needs to listen to Jesus before planning, reacting, or solving"
  },
  {
    terms: ["thirst", "living water", "samaritan"],
    anchor: "Jesus meets the Samaritan woman's thirst with truth and living water.",
    action: "bringing real thirst to Christ",
    personal: "I try to satisfy loneliness, stress, or insecurity in ways that leave me thirsty",
    work: "achievement or approval becomes the well I keep returning to",
    family: "honest prayer can name what is dry, strained, or hidden at home"
  },
  {
    terms: ["sight", "blind", "light of the world"],
    anchor: "The man born blind receives sight while others resist the truth in front of them.",
    action: "letting Christ heal blindness",
    personal: "I may be blind to a pattern everyone else can see",
    work: "assumptions about someone's motives keep me from seeing the person clearly",
    family: "we need light on a recurring conflict instead of repeating the same explanations"
  },
  {
    terms: ["lazarus", "tomb", "resurrection", "sealed off"],
    anchor: "Jesus weeps at the tomb and calls Lazarus into life.",
    action: "hope where things feel sealed off",
    personal: "I have accepted discouragement as final in an area where Jesus may still be calling life",
    work: "a stuck relationship or project needs hope, truth, and a next faithful step",
    family: "a hard family pattern needs someone to help remove the stone without losing hope"
  },
  {
    terms: ["passion", "palm", "holy week", "humility"],
    anchor: "Palm Sunday holds praise and betrayal together as Jesus gives himself in humility.",
    action: "humble fidelity when love costs something",
    personal: "I praise Jesus but resist the particular sacrifice he is asking of me",
    work: "staying faithful may mean absorbing misunderstanding without becoming bitter",
    family: "Holy Week can become less rushed if we choose one concrete act of humble love"
  },
  {
    terms: ["easter sunday", "resurrection of the lord", "easter", "empty tomb"],
    anchor: "The disciples find the empty tomb, and Easter hope begins to change what they can imagine.",
    action: "living as if resurrection is true",
    personal: "I speak about hope but still live as if fear has the final word",
    work: "a discouraging situation needs a response shaped by hope instead of cynicism",
    family: "Easter joy can show up as gratitude, patience, and refusing to let stress rule the home"
  },
  {
    terms: ["locked doors", "thomas", "doubt", "divine mercy"],
    anchor: "The risen Jesus enters locked doors, speaks peace, and meets Thomas in his doubt.",
    action: "receiving mercy honestly",
    personal: "I hide fear or doubt instead of bringing it to Christ",
    work: "a tense relationship needs peace rather than self-protection",
    family: "someone's doubt or anxiety needs patient presence, not embarrassment or quick answers"
  },
  {
    terms: ["emmaus", "breaking of bread", "discouraged"],
    anchor: "Jesus walks with discouraged disciples, opens Scripture, and is known in the breaking of bread.",
    action: "recognizing Christ on the road",
    personal: "I am walking away from disappointment and need to let Jesus reinterpret it",
    work: "a discouraging outcome needs reflection instead of immediate resignation",
    family: "table conversation can become a place where we notice how Christ was present"
  },
  {
    terms: ["shepherd", "gate", "voice"],
    anchor: "Jesus is the shepherd and gate whose voice leads to abundant life.",
    action: "following the Shepherd's voice",
    personal: "competing voices of fear, comparison, or productivity are louder than Jesus",
    work: "I need to discern whether a decision follows the Shepherd or just ambition",
    family: "our home can reduce noise so the Shepherd's voice becomes easier to recognize"
  },
  {
    terms: ["way, the truth, and the life", "troubled hearts"],
    anchor: "Jesus tells troubled hearts to trust him because he is the way, the truth, and the life.",
    action: "trusting Christ as the way",
    personal: "my heart is troubled and I am looking for a way around trust",
    work: "a practical problem needs truth and service, not just efficiency",
    family: "we need to ask whether our next step follows Jesus or just lowers tension"
  },
  {
    terms: ["obedience", "advocate", "spirit remains"],
    anchor: "Jesus connects love with obedience and promises the Spirit as Advocate.",
    action: "love that becomes obedience",
    personal: "I say I love Jesus but resist one concrete command",
    work: "I need gentleness and courage to explain hope without arguing or hiding",
    family: "the Spirit can help us obey in ordinary routines, apologies, and patience"
  },
  {
    terms: ["ascension", "sends", "make disciples"],
    anchor: "The risen Jesus sends his disciples and promises to remain with them.",
    action: "living mission with Christ's presence",
    personal: "I feel underprepared for a responsibility God has placed in front of me",
    work: "ordinary influence can become mission through integrity, service, and witness",
    family: "parents share mission by teaching faith through practice, not only explanation"
  },
  {
    terms: ["pentecost", "spirit gives", "languages", "forgiveness"],
    anchor: "Pentecost turns fear into witness and gives gifts for the good of the body.",
    action: "cooperating with the Holy Spirit",
    personal: "fear keeps me quiet where the Spirit may be asking for witness",
    work: "different personalities or roles need unity without everyone becoming the same",
    family: "forgiveness and peace at home can be a real sign of the Spirit"
  },
  {
    terms: ["trinity", "communion"],
    anchor: "God reveals himself as merciful communion: Father, Son, and Holy Spirit.",
    action: "reflecting communion rather than isolation",
    personal: "I withdraw, control, or self-protect instead of receiving mercy and relationship",
    work: "a team or relationship needs patience and peace more than winning",
    family: "our home can reflect communion through listening, gratitude, and repair"
  },
  {
    terms: ["gaudete", "rejoice", "joy"],
    anchor: "Gaudete Sunday calls God's people to rejoice because the Lord is near.",
    action: "choosing Christian joy",
    personal: "I let stress narrate the whole story and miss reasons for gratitude",
    work: "complaint becomes the shared language, and I can choose a different tone",
    family: "our home can practice joy through gratitude, prayer, and attention to good news"
  },
  {
    terms: ["mary", "yes", "humble trust"],
    anchor: "Mary receives God's word with honest questions and a faithful yes.",
    action: "saying yes with trust",
    personal: "God may be asking for a yes before I know every detail",
    work: "a responsibility requires humble service rather than control",
    family: "our family can make space for quiet listening before the next yes"
  }
];

function getScenarioText(week) {
  return [
    week.title,
    week.theme,
    week.reflection,
    ...(week.discussion || [])
  ].join(" ").toLowerCase();
}

function getDiscussionScenario(week) {
  const scenarioText = getScenarioText(week);
  const matchedScenario = discussionScenarios
    .map((scenario) => {
      const matchedTerms = scenario.terms.filter((term) => scenarioText.includes(term));
      const termWeight = matchedTerms.reduce((total, term) => total + term.length, 0);
      return {
        scenario,
        score: (matchedTerms.length * 100) + termWeight
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.scenario;

  return matchedScenario || {
    anchor: `The readings for ${week.title} center on this theme: ${week.theme}`,
    action: "a faithful concrete response",
    personal: "the readings expose a pattern in my own choices, reactions, or priorities",
    work: "the same Gospel pattern appears in pressure, responsibility, or conflict outside the home",
    family: "our home has a concrete chance to practice the grace named in the readings"
  };
}

function scenarioQuestions(scope, scenarioExample, scenarioAction) {
  return compactQuestions([
    `Where could this show up ${scope}: ${scenarioExample}?`,
    "What would my easiest reaction be, and what does the reading ask instead?",
    `What concrete step would ${scenarioAction} require before we meet again?`
  ]);
}

function getDiscussionLevels(week) {
  if (week.discussionLevels) {
    return week.discussionLevels
      .filter((topic) => topic.title.toLowerCase() !== "faith")
      .map(normalizeDiscussionTopic);
  }

  const scenario = getDiscussionScenario(week);

  return [
    {
      title: "Personal",
      helper: scenario.anchor,
      questions: scenarioQuestions("personally", scenario.personal, scenario.action)
    },
    {
      title: "Work",
      helper: "Look for the same reading theme in decisions, pressure, and relationships outside the home.",
      questions: scenarioQuestions("at work or in public life", scenario.work, scenario.action)
    },
    {
      title: "Family",
      helper: "Bring the readings into ordinary parenting, marriage, and home life.",
      questions: scenarioQuestions("at home", scenario.family, scenario.action)
    }
  ].map(normalizeDiscussionTopic);
}

function sanitizeReference(ref) {
  return ref
    .replace(/\u2014/g, "-")
    .replace(/\u2013/g, "-")
    .replace(/\bor\b.*$/i, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bcf\.\s*/gi, "")
    .trim();
}

function getBookKey(ref) {
  const names = Object.keys(bookMap).sort((a, b) => b.length - a.length);
  return names.find((name) => ref === name || ref.startsWith(`${name} `));
}

function parseVerseNumber(value) {
  const match = String(value).trim().match(/\d+/);
  return match ? Number(match[0]) : null;
}

function toDouayPsalmChapter(chapter) {
  if (chapter <= 8 || chapter >= 148) {
    return chapter;
  }

  if (chapter <= 113) {
    return chapter - 1;
  }

  if (chapter === 114 || chapter === 115) {
    return 113;
  }

  if (chapter === 116) {
    return 114;
  }

  if (chapter <= 146) {
    return chapter - 1;
  }

  return 146;
}

function normalizeChapter(bookKey, chapter) {
  return bookKey === "Ps" ? toDouayPsalmChapter(chapter) : chapter;
}

function parseSegments(ref) {
  const cleanRef = sanitizeReference(ref);
  const bookKey = getBookKey(cleanRef);
  if (!bookKey) {
    throw new Error(`Unsupported book in reference: ${ref}`);
  }

  const segmentText = cleanRef.slice(bookKey.length).trim();
  const parts = segmentText.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  const segments = [];
  let currentChapter = null;

  parts.forEach((part) => {
    const normalized = part.replace(/\+/g, ",");
    normalized.split(",").map((piece) => piece.trim()).filter(Boolean).forEach((piece) => {
      let working = piece;
      if (working.includes(":")) {
        const chapterMatch = working.match(/^(\d+)\s*:/);
        if (chapterMatch) {
          currentChapter = Number(chapterMatch[1]);
          working = working.slice(chapterMatch[0].length);
        }
      }

      if (!currentChapter) {
        return;
      }

      if (working.includes("-")) {
        const [startRaw, endRaw] = working.split("-").map((value) => value.trim());
        const start = parseVerseNumber(startRaw);
        let endChapter = currentChapter;
        let end = parseVerseNumber(endRaw);

        if (endRaw.includes(":")) {
          const [chapterRaw, verseRaw] = endRaw.split(":");
          endChapter = Number(chapterRaw);
          end = parseVerseNumber(verseRaw);
        }

        if (start && end) {
          segments.push({
            chapter: normalizeChapter(bookKey, currentChapter),
            start,
            endChapter: normalizeChapter(bookKey, endChapter),
            end
          });
          currentChapter = endChapter;
        }
      } else {
        const verse = parseVerseNumber(working);
        if (verse) {
          segments.push({
            chapter: normalizeChapter(bookKey, currentChapter),
            start: verse,
            endChapter: normalizeChapter(bookKey, currentChapter),
            end: verse
          });
        }
      }
    });
  });

  return { bookKey, file: bookMap[bookKey], segments };
}

async function loadBook(file) {
  if (bookCache.has(file)) {
    return bookCache.get(file);
  }

  const url = `https://raw.githubusercontent.com/janvier-s/original-douay-rheims/main/bible/raw/${file}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  const data = await response.json();
  bookCache.set(file, data);
  return data;
}

function getChapter(book, chapterNumber) {
  return book.chapters.find((chapter) => Number(chapter.chapter) === Number(chapterNumber));
}

function versesForSegment(book, segment) {
  const verses = [];
  for (let chapterNumber = segment.chapter; chapterNumber <= segment.endChapter; chapterNumber += 1) {
    const chapter = getChapter(book, chapterNumber);
    if (!chapter) {
      continue;
    }

    const start = chapterNumber === segment.chapter ? segment.start : 1;
    const end = chapterNumber === segment.endChapter
      ? segment.end
      : Math.max(...chapter.verses.map((verse) => Number(verse.verse)));

    chapter.verses.forEach((verse) => {
      const verseNumber = Number(verse.verse);
      if (verseNumber >= start && verseNumber <= end) {
        const text = String(verse.text).replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
        verses.push(text);
      }
    });
  }
  return verses;
}

async function loadPassage(ref) {
  const cacheKey = sanitizeReference(ref);
  if (passageCache.has(cacheKey)) {
    return passageCache.get(cacheKey);
  }

  const parsed = parseSegments(ref);
  const book = await loadBook(parsed.file);
  const text = parsed.segments
    .flatMap((segment) => versesForSegment(book, segment))
    .join("\n");

  const result = text || "Passage text is not available for this citation. Use the official readings link for the liturgical text.";
  passageCache.set(cacheKey, result);
  return result;
}

function setLoadingReadings(week) {
  elements.readingsList.innerHTML = "";
  week.readings.forEach((reading, index) => {
    const article = document.createElement("article");
    article.className = "reading";
    article.innerHTML = `
      <div class="reading-header">
        <div>
          <h3>${reading.label}</h3>
          <cite>${reading.ref}</cite>
        </div>
        <div class="reading-actions">
          <button class="small-button read-reading-button" type="button" data-reading-index="${index}" aria-pressed="false" disabled>
            Read
          </button>
        </div>
      </div>
      <p class="reading-text loading">Loading passage text...</p>
    `;
    elements.readingsList.append(article);
  });
}

async function renderReadings(week) {
  const cards = [...elements.readingsList.querySelectorAll(".reading")];

  await Promise.all(week.readings.map(async (reading, index) => {
    const textElement = cards[index].querySelector(".reading-text");
    try {
      textElement.textContent = await loadPassage(reading.ref);
      textElement.classList.remove("loading");
      cards[index].querySelector(".read-reading-button").disabled = false;
    } catch (error) {
      textElement.textContent = "Passage text could not be loaded. Use the official readings link for this citation.";
      textElement.classList.add("loading");
      console.warn(error);
    }
  }));
}

function renderWeek(index) {
  stopSpeech();
  const week = readings[index];

  elements.liturgicalDate.textContent = `${formatDisplayDate(week.date)} - ${week.cycle}`;
  elements.title.textContent = week.title;
  elements.theme.textContent = week.theme;
  elements.reflection.textContent = week.reflection;
  elements.prayer.textContent = week.prayer;
  elements.officialLink.href = week.officialUrl;

  elements.discussion.innerHTML = "";
  getDiscussionLevels(week).forEach((level) => {
    const card = document.createElement("article");
    card.className = "discussion-level";
    const questions = level.questions.map((question) => `<li>${question}</li>`).join("");
    card.innerHTML = `
      <div class="discussion-level-heading">
        <h4>${level.title}</h4>
        <p>${level.helper}</p>
      </div>
      <ul class="discussion-questions">${questions}</ul>
    `;
    elements.discussion.append(card);
  });

  setLoadingReadings(week);
  renderReadings(week);
}

function speakReading(index, button) {
  if (!("speechSynthesis" in window)) {
    alert("This browser does not support built-in text to speech.");
    return;
  }

  const card = elements.readingsList.querySelectorAll(".reading")[index];
  if (!card) {
    return;
  }

  const label = card.querySelector("h3").textContent;
  const ref = card.querySelector("cite").textContent;
  const text = card.querySelector(".reading-text").textContent;

  const utterance = new SpeechSynthesisUtterance(`${label}. ${ref}. ${text}`);
  const voice = getSelectedVoice();
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  } else {
    utterance.lang = defaultVoiceLang;
  }
  utterance.rate = 0.88;
  utterance.pitch = 1.02;
  activeSpeechButton = button;
  activeUtterance = utterance;
  button.textContent = "Stop";
  button.setAttribute("aria-pressed", "true");
  utterance.addEventListener("end", () => {
    if (activeUtterance === utterance) {
      resetActiveSpeechButton();
    }
  });
  utterance.addEventListener("error", () => {
    if (activeUtterance === utterance) {
      resetActiveSpeechButton();
    }
  });
  window.speechSynthesis.speak(utterance);
}

function resetActiveSpeechButton() {
  if (activeSpeechButton) {
    activeSpeechButton.textContent = "Read";
    activeSpeechButton.setAttribute("aria-pressed", "false");
  }

  activeSpeechButton = null;
  activeUtterance = null;
}

function stopSpeech() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  resetActiveSpeechButton();
}

function toggleReadingSpeech(index, button) {
  if (activeSpeechButton === button) {
    stopSpeech();
    return;
  }

  stopSpeech();
  speakReading(index, button);
}

populateSelect();
populateVoiceSelect();
setTextScale(getStoredTextScale());
const defaultIndex = findDefaultIndex();
elements.select.value = String(defaultIndex);
renderWeek(defaultIndex);

elements.select.addEventListener("change", (event) => {
  renderWeek(Number(event.target.value));
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", populateVoiceSelect);
}

if (elements.voiceSelect) {
  elements.voiceSelect.addEventListener("change", () => {
    localStorage.setItem("stMarthaVoice", elements.voiceSelect.value);
    stopSpeech();
  });
}

if (elements.decreaseTextSize) {
  elements.decreaseTextSize.addEventListener("click", () => {
    adjustTextScale(-1);
  });
}

if (elements.increaseTextSize) {
  elements.increaseTextSize.addEventListener("click", () => {
    adjustTextScale(1);
  });
}

elements.readingsList.addEventListener("click", (event) => {
  const readButton = event.target.closest(".read-reading-button");
  if (readButton) {
    toggleReadingSpeech(Number(readButton.dataset.readingIndex), readButton);
    return;
  }
});
