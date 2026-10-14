import { clamp, type Random } from "./random";

/**
 * Synthetic text for the local demo seed. Everything here is invented; no real
 * person, account, or message is represented.
 */

export const FIRST_NAMES = [
  "Aroha", "Tama", "Mere", "Wiremu", "Anahera", "Rawiri", "Kahu", "Hana", "Nikau", "Ataahua",
  "Sione", "Losa", "Tevita", "Mele", "Ioane", "Salote", "Malia", "Pita", "Lagi", "Viliami",
  "Wei", "Jun", "Mei", "Hao", "Xin", "Lan", "Jia", "Yuki", "Haruto", "Sakura",
  "Min-jun", "Ji-woo", "Seo-yeon", "Hyun", "Priya", "Arjun", "Ananya", "Rohan", "Isha", "Dev",
  "Olivia", "Liam", "Charlotte", "Oliver", "Amelia", "Jack", "Isla", "Noah", "Ava", "Leo",
  "Sophie", "George", "Ruby", "Harry", "Grace", "Hugo", "Mia", "Finn", "Zoe", "Max",
  "Lucas", "Ella", "Mateo", "Chloe", "Ethan", "Lily", "Kai", "Maya", "Sam", "Nina",
  "Fatima", "Omar", "Layla", "Yusuf", "Aisha", "Elena", "Tomas", "Ingrid", "Lars", "Freya",
  "Thanh", "Linh", "Bao", "An", "Rizal", "Dewi", "Joaquin", "Camila", "Diego", "Valentina",
] as const;

export const LAST_NAMES = [
  "Ngata", "Parata", "Walker", "Tipene", "Horomona", "Te Huia", "Moana", "Rangi", "Kereama", "Pōtae",
  "Fifita", "Taufa", "Leota", "Faleolo", "Tuilagi", "Vaipulu", "Soakai", "Tupou",
  "Chen", "Wang", "Li", "Zhang", "Liu", "Huang", "Tanaka", "Sato", "Kim", "Park", "Lee", "Choi",
  "Patel", "Sharma", "Singh", "Gupta", "Reddy", "Nair",
  "Smith", "Brown", "Wilson", "Taylor", "Thompson", "Anderson", "Campbell", "Stewart", "Robinson", "Clarke",
  "Nguyen", "Tran", "Pham", "Santos", "Reyes", "Garcia", "Martinez", "Rossi", "Müller", "Hansen",
  "Haddad", "Rahman", "Khan", "O'Brien", "Murphy", "Fraser", "MacDonald", "Kaur",
] as const;

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP", "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ", "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

export const JOBS = [
  "Computer Science @ UoA", "Software engineering intern", "Nursing student", "Barista + part-time student",
  "Med student, surviving", "Graphic designer", "Law student", "Junior developer", "Primary school teacher",
  "Architecture student", "Physio", "Product designer", "Data analyst", "Chef de partie", "Marketing coordinator",
  "PhD candidate, marine biology", "Engineering student", "Pharmacist", "Music teacher", "UX researcher",
  "Accountant (it's fine)", "Climbing instructor", "Bookshop assistant", "Civil engineer", "Film student",
  "Vet nurse", "Startup founder (tiny)", "Physics tutor", "Dental student", "Event planner",
] as const;

export const ARTISTS = [
  "Laufey", "Lorde", "Benee", "Six60", "L.A.B.", "Mitski", "Phoebe Bridgers", "Frank Ocean", "SZA",
  "Fred again..", "Tame Impala", "Boygenius", "Olivia Rodrigo", "Kendrick Lamar", "Taylor Swift",
  "Mac DeMarco", "The Beths", "Fazerdaze", "Coldplay", "Bon Iver", "Stan Walker", "Chappell Roan",
  "Clairo", "Daniel Caesar", "NewJeans", "Hozier", "Rüfüs Du Sol", "Tash Sultana", "Sabrina Carpenter",
  "Steve Lacy", "Khruangbin", "Nujabes", "Joji", "Arlo Parks", "Maisey Rika", "Te Kaahu",
] as const;

export const SONGS = [
  "From The Start", "Green Light", "Supalonely", "Don't Forget Your Roots", "In The Air", "Nobody",
  "Motion Sickness", "Pink + White", "Good Days", "Delilah", "The Less I Know The Better", "Not Strong Enough",
  "drivers license", "Cruel Summer", "Ribs", "Silver Lining", "Pink Pony Club", "Sofia", "Best Part",
  "Super Shy", "Work Song", "Espresso", "Bags", "Dark Red", "Feather", "Heat Waves",
] as const;

export const SHOWS = [
  "The Bear", "Severance", "Shōgun", "Abbott Elementary", "Reservation Dogs", "Taskmaster NZ", "Wellington Paranormal",
  "Normal People", "Arcane", "One Piece", "Frieren", "Blue Eye Samurai", "Only Murders in the Building",
  "Fleabag", "Heartstopper", "Bluey (no shame)", "Succession", "Slow Horses", "The Last of Us", "Hacks",
] as const;

export const BOOKS = [
  "Tomorrow, and Tomorrow, and Tomorrow", "Piranesi", "The Bone People", "Klara and the Sun", "Normal People",
  "Project Hail Mary", "The Luminaries", "Atomic Habits", "Braiding Sweetgrass", "The Secret History",
  "Pachinko", "Remarkably Bright Creatures", "Demon Copperhead", "Yellowface", "Four Thousand Weeks",
] as const;

export const FOODS = [
  "kimchi fried rice", "a mince and cheese pie", "flat white and a cheese scone", "homemade dumplings", "pho from the place on Dominion Rd",
  "hāngī at my aunty's", "butter chicken with too much naan", "a fried egg sandwich", "sushi from the train station", "chilli oil noodles",
  "fish and chips at the beach", "leftover lasagne", "avocado on toast (I know)", "a pineapple lump brownie", "laksa",
  "banh mi", "a big bowl of porridge with feijoas", "kumara chips", "my flatmate's curry", "bibimbap",
  "roti and dhal", "a sad desk salad", "pancakes with lemon and sugar", "ramen at 11pm", "a pavlova someone brought to work",
] as const;

export const PLACES = [
  "Auckland Central", "Ponsonby", "Mt Eden", "Grey Lynn", "Kingsland", "Newmarket", "Parnell", "Devonport", "Takapuna",
  "Mission Bay", "Piha", "Muriwai", "Waiheke Island", "Hamilton", "Raglan", "Tauranga", "Mount Maunganui", "Rotorua",
  "Taupō", "Napier", "Wellington", "Cuba Street", "Nelson", "Christchurch", "Dunedin", "Queenstown", "Wānaka",
] as const;

export const SPOTS = [
  "the library level 4", "the flat", "Albert Park", "the bus", "the climbing gym", "the beach", "my desk", "the kitchen",
  "Maungawhau summit", "Shakespear Park", "the farmers market", "the studio", "the lab", "the café downstairs",
  "Western Springs", "the Domain", "the ferry", "my car", "the couch", "work",
] as const;

export const ACTIVITIES = [
  "went for a run around the Domain", "finally finished my assignment", "climbed a new V4", "cooked for the whole flat",
  "had a long call with my mum", "walked up Mt Eden at sunset", "did a 6am gym session", "spent the afternoon at the beach",
  "read in the sun for two hours", "tried a new café in Kingsland", "cleaned my room properly", "went to a gig on K Road",
  "studied with friends at the library", "took the ferry to Devonport", "planted herbs on the balcony", "went op-shopping",
  "made sourdough (it was flat)", "did a pottery class", "biked the waterfront", "played touch rugby after work",
] as const;

const BIO_PARTS = [
  "collecting small good moments", "coffee, climbing, code", "professional over-thinker", "here for the sunsets",
  "trying to post every day", "bad at sleeping, good at snacks", "probably at the beach", "ask me about my sourdough",
  "plant parent (3 alive)", "running slowly but often", "film camera enthusiast", "learning te reo, one kupu at a time",
  "chasing the perfect flat white", "always down for dumplings", "currently reading too many books at once",
  "making playlists nobody asked for", "weekend tramper", "it's a good day to have a good day",
] as const;

const EMOJI = ["☕️", "🌿", "📷", "🌊", "🎧", "📚", "🧗", "🍜", "🌅", "✨", "🐶", "🎨", "🏃", "🌻"] as const;

export function makeBio(random: Random, place: string, job: string): string {
  const parts = random.sample(BIO_PARTS, random.int(1, 2));
  const segments = [place.split(" ")[0]!, ...parts];
  if (random.chance(0.4)) segments.splice(1, 0, job.toLowerCase());
  const bio = `${segments.join(" · ")} ${random.chance(0.6) ? random.pick(EMOJI) : ""}`.trim();
  return bio.length <= 160 ? bio : bio.slice(0, 160).trim();
}

/** Lowercase handle from a name, matching the API's username rule. */
export function usernameCandidates(random: Random, first: string, last: string): string[] {
  const clean = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  const f = clean(first);
  const l = clean(last);
  const year = random.int(90, 99 + 7) % 100;
  return [
    `${f}_${l}`,
    `${f}${l}`,
    `${f}.${l}`.replace(".", "_"),
    `${f}${l[0] ?? ""}`,
    `${f}_${l[0] ?? ""}${String(year).padStart(2, "0")}`,
    `the${f}${l[0] ?? ""}`,
    `${f}${random.int(1, 999)}`,
  ].map((candidate) => candidate.slice(0, 30)).filter((candidate) => /^[a-z0-9][a-z0-9_]{2,29}$/.test(candidate));
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export interface AnswerContext {
  promptText: string;
  rating: number;
  friendNames: readonly string[];
  favouriteArtist: string;
  home: string;
  weekday: number;
  monthIndex: number;
}

type Category =
  | "food" | "music" | "sleep" | "people" | "weather" | "media" | "learn"
  | "gratitude" | "goals" | "feeling" | "words" | "place" | "memory" | "general";

function categorise(prompt: string): Category {
  const text = prompt.toLowerCase();
  const has = (words: string) => new RegExp(`\\b(?:${words})`).test(text);
  if (has("three words|one sentence|one word|in a sentence")) return "words";
  if (has("meal|eat\\b|ate\\b|breakfast|lunch|dinner|food|cook|snack|drink")) return "food";
  if (has("song|music|lyric|listen|playlist|album|on repeat")) return "music";
  if (has("wake|woke|sleep|bed\\b|morning|tired")) return "sleep";
  if (has("weather|rain|sunny")) return "weather";
  if (has("book|show\\b|watch|movie|film|podcast|reading|read\\b")) return "media";
  if (has("learn|advice|googled|surprised|interesting|conversation")) return "learn";
  if (has("who\\b|someone|friend|reached out|meet|appreciat|thinking about|spend time")) return "people";
  if (has("where|place|comfort")) return "place";
  if (has("remember|reminisc|reminsc|memory|last time|childhood|ago\\b")) return "memory";
  if (has("goal|achieve|habit|looking forward|want to|plan|future|this year")) return "goals";
  if (has("feel|mind|cried|mood|stress|worr|anxious|energy")) return "feeling";
  if (has("grateful|smile|joy|best|favourite|beautiful|win\\b|proud|underrated|enjoy|fun\\b|laugh")) return "gratitude";
  return "general";
}

const LOW_TAILS = [
  "Honestly a rough one. Tomorrow will be better.",
  "Not my best day, but I got through it.",
  "Feeling pretty flat today. Early night.",
  "Everything felt like a lot today. Being gentle with myself.",
  "Tired in a way sleep doesn't fix. Writing it down helps a bit.",
] as const;

const MID_TAILS = [
  "Pretty ordinary day, which is kind of nice.",
  "Not bad, not amazing. Steady.",
  "A quiet one. I'll take it.",
  "Busy but okay.",
  "Solid day overall.",
] as const;

const HIGH_TAILS = [
  "Genuinely one of the good ones.",
  "Grinning while I write this.",
  "Full heart tonight.",
  "Days like this make up for the rest.",
  "Felt like everything clicked today.",
] as const;

function fill(random: Random, template: string, context: AnswerContext): string {
  const friend = context.friendNames.length > 0 ? random.pick(context.friendNames) : random.pick(FIRST_NAMES);
  const replacements: Record<string, () => string> = {
    food: () => random.pick(FOODS),
    friend: () => friend,
    artist: () => (random.chance(0.5) ? context.favouriteArtist : random.pick(ARTISTS)),
    song: () => random.pick(SONGS),
    show: () => random.pick(SHOWS),
    book: () => random.pick(BOOKS),
    spot: () => random.pick(SPOTS),
    activity: () => random.pick(ACTIVITIES),
    place: () => context.home,
    time: () => `${random.int(5, 10)}:${String(random.pick([0, 5, 10, 15, 20, 30, 40, 45, 50])).padStart(2, "0")}`,
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => replacements[key]?.() ?? match);
}

const ANSWERS: Record<Category, { low: readonly string[]; mid: readonly string[]; high: readonly string[] }> = {
  food: {
    low: ["Toast over the sink. Didn't have the energy for more.", "Skipped lunch and regretted it. Ended up with {food} at 9pm.", "Just {food}. Comfort food kind of day."],
    mid: ["{food}. Simple but it hit the spot.", "Had {food} with {friend} after class.", "Made {food} and there's enough left for tomorrow, which future me will appreciate."],
    high: ["{food} with {friend} and it was unreal. Might go back tomorrow.", "Cooked {food} for the flat and everyone went back for seconds!", "{food} at sunset. Nothing beats it."],
  },
  music: {
    low: ["{song} on repeat while staring at the ceiling.", "Been listening to {artist} because it matches the mood.", "Sad {artist} hours."],
    mid: ["{song} by {artist}. It's been stuck in my head since the bus.", "Can't stop playing {artist}. {song} especially.", "My Discover Weekly gave me {artist} and I'm hooked."],
    high: ["Screamed {song} in the car with {friend}. 10/10.", "Saw {artist} songs at a gig and I'm still buzzing.", "{song} came on at exactly the right moment today and I nearly cried (good way)."],
  },
  sleep: {
    low: ["Woke up at {time} after maybe four hours. Running on coffee.", "Alarm went off at {time} and I snoozed four times. Late to everything.", "Couldn't sleep, kept thinking about deadlines."],
    mid: ["Up at {time}. Slow coffee, a bit of reading, then into it.", "{time}. Not early, not late. Fine.", "Woke at {time} to rain on the roof, which was kind of lovely."],
    high: ["Up at {time} without an alarm and actually felt rested?? Watched the sunrise.", "Slept nine hours and feel like a new person.", "Early start at {time}, walked to {spot} before anyone else was around. Magic."],
  },
  people: {
    low: ["Mostly kept to myself today. Texted {friend} though, which helped.", "Didn't really see anyone. Missing my people.", "{friend} checked in on me. Didn't realise how much I needed that."],
    mid: ["{friend}. We did groceries and talked about nothing for an hour.", "Lunch with {friend} at {spot}.", "Caught up with {friend} after ages. Felt easy, like no time had passed."],
    high: ["Spent the whole day with {friend} and my face hurts from laughing.", "{friend} surprised me with a coffee and a note. Who does that?!", "Big group dinner with {friend} and everyone. My favourite people in one room."],
  },
  weather: {
    low: ["Grey and drizzly all day. Matched my mood.", "Classic Auckland: four seasons before lunch. Got soaked twice.", "Windy and cold. Stayed in."],
    mid: ["Overcast but warm. Good walking weather.", "Bit of sun, bit of cloud. Very {place}.", "Rain in the morning, cleared by afternoon."],
    high: ["Blue skies all day!! Ate lunch outside at {spot}.", "Perfect day: sunny, no wind, warm enough for jandals.", "Golden hour was ridiculous tonight. Everyone at {spot} stopped to look."],
  },
  media: {
    low: ["Rewatching {show} because I can't handle anything new.", "Trying to read {book} but can't focus.", "Comfort show: {show}. That's all I've got today."],
    mid: ["Halfway through {book}. Slow start but it's getting good.", "Started {show} on {friend}'s recommendation.", "Been into {show} lately. Two episodes tonight, no more (lie)."],
    high: ["Finished {book} and I need to talk to someone about it immediately.", "{show} is SO good. Why did nobody tell me sooner?", "Stayed up way too late with {book}. Worth it."],
  },
  learn: {
    low: ["Learned that I really need to start assignments earlier. Again.", "Googled 'how long can you survive on coffee'. Answer: not long.", "Got surprised by a test I forgot about."],
    mid: ["Learned how to make proper dumpling folds from {friend}'s nana.", "Googled whether octopuses dream. They might!", "Good advice from {friend}: done is better than perfect."],
    high: ["Had the best conversation with {friend} about what we actually want from life.", "Finally understood recursion. Like, actually.", "Learned a new climbing technique and sent my project first try after."],
  },
  gratitude: {
    low: ["Grateful for {friend}, honestly. Small mercies.", "A warm shower and clean sheets. That's the win today.", "Hard to find one today, but the cat sat on me, so."],
    mid: ["{food} and a free afternoon. Small joys.", "Grateful that {friend} saved me a seat.", "Found $20 in an old jacket. Counting it."],
    high: ["Everything about today. {activity} and it felt perfect.", "So proud: finally {activity}!", "The sunset from {spot} tonight. Stopped me in my tracks."],
  },
  goals: {
    low: ["Want to get back into a routine. This week has been chaos.", "Trying to be kinder to myself about progress.", "Goal for tomorrow: just get out of bed on time."],
    mid: ["Want to run 10k before summer. At 6k now.", "Trying to read 20 books this year. On track-ish.", "Working on posting here every day. So far so good."],
    high: ["Booked flights for the trip I've been saving for!!", "Signed up for the half marathon. No going back.", "Hit my savings goal a month early."],
  },
  feeling: {
    low: ["Anxious about everything at once. Writing it down to get it out of my head.", "Bit lonely tonight, if I'm honest.", "Drained. Need a quiet weekend."],
    mid: ["Calm. A little tired. Content.", "Thinking about the week ahead, but in a manageable way.", "Okay. Genuinely okay."],
    high: ["Happy in a light, floaty way.", "Energised! Got so much done.", "Grateful and grounded."],
  },
  words: {
    low: ["Long. Grey. Done.", "Tired, tired, tired.", "Today was something to get through."],
    mid: ["Busy, cosy, fine.", "Coffee, lectures, noodles.", "A slow, steady, ordinary day."],
    high: ["Sunny, silly, perfect.", "Laughing the whole time.", "Today was exactly what I needed."],
  },
  place: {
    low: ["My bed. Didn't leave it much.", "{spot}, trying and failing to focus.", "Hiding in the library."],
    mid: ["{spot}. It's become my spot.", "Mostly at {spot}, then home.", "Split between {spot} and the bus."],
    high: ["{spot} with {friend}, all afternoon.", "Out in {place}. Didn't want to come inside.", "{spot} at golden hour. Best place in the world."],
  },
  memory: {
    low: ["Thinking about how things used to be simpler.", "Missing home a bit tonight.", "Remembered something embarrassing from high school at 2am. Classic."],
    mid: ["Found old photos from {place} and got nostalgic.", "Reminiscing about summer roadtrips with {friend}.", "Smelled sunscreen and was instantly eight years old at the beach."],
    high: ["{friend} sent a video from our first year at uni. Crying laughing.", "Revisited the café where it all started. Still perfect.", "Thinking about how far I've come this year. Proud."],
  },
  general: {
    low: ["Not much to say today. Just getting through.", "Hard day. Tomorrow's a fresh start.", "Rough one. Glad it's over."],
    mid: ["{activity}. Nice and simple.", "Busy day at {spot} but got through the list.", "A mix of good and meh."],
    high: ["{activity} and it was the best.", "Fantastic day: {activity} with {friend}.", "Couldn't have asked for more."],
  },
};

export function makeAnswer(random: Random, context: AnswerContext): string {
  const category = categorise(context.promptText);
  const tier = context.rating <= 4 ? "low" : context.rating <= 7 ? "mid" : "high";
  const parts = [fill(random, random.pick(ANSWERS[category][tier]), context)];
  // Longer reflections now and then, like real journaling.
  if (random.chance(0.45)) {
    const generalTier = ANSWERS.general[tier];
    const extra = fill(random, random.pick(generalTier), context);
    if (!parts.includes(extra)) parts.push(extra);
  }
  if (random.chance(0.35)) {
    const tails = tier === "low" ? LOW_TAILS : tier === "mid" ? MID_TAILS : HIGH_TAILS;
    parts.push(random.pick(tails));
  }
  if (context.weekday === 5 && random.chance(0.3)) parts.push("Friday feeling.");
  if (context.weekday === 0 && random.chance(0.25)) parts.push("Sunday scaries kicking in a bit.");
  return parts.join(" ").trim().slice(0, 4000).trim();
}

const CAPTIONS = [
  "📍 {spot}", "golden hour again", "this view though", "a good day for it", "{food} >>>", "not pictured: me being cold",
  "core memory unlocked", "brb moving here", "{friend} took this", "soft life", "Sunday reset", "office for today",
  "the sky did that", "can't stop won't stop", "small joys", "obligatory sunset pic", "sorry for the spam", "worth the climb",
] as const;

export function makeCaption(random: Random, context: AnswerContext): string {
  return fill(random, random.pick(CAPTIONS), context).slice(0, 1000);
}

const TOMORROW_NOTES = [
  "Drink more water. Seriously.", "You've got this. Start with the hardest task first.", "Remember to call Mum back.",
  "Go to bed before midnight tonight, please.", "Be proud of yesterday. Keep the momentum.", "Don't forget the library book!",
  "Take a walk at lunch, even a short one.", "It's okay if tomorrow is slow.", "Text {friend} back.", "Pack your gym bag tonight.",
  "Tomorrow-you deserves a nice coffee.", "Breathe. One thing at a time.", "Submit the form before 5pm!", "Stretch before your run.",
] as const;

export function makeTomorrowNote(random: Random, context: AnswerContext): string {
  return fill(random, random.pick(TOMORROW_NOTES), context).slice(0, 1000);
}

/** Seasonal Auckland-ish weather for a southern-hemisphere month (0 = January). */
export function makeWeather(random: Random, monthIndex: number, home: string): { condition: string; temperatureC: number; placeName: string } {
  const seasonalMean = [23, 24, 22, 19, 16, 14, 13, 13, 15, 16, 18, 21][monthIndex]!;
  const winter = monthIndex >= 4 && monthIndex <= 8;
  const condition = random.weighted<string>([
    ["clear", winter ? 2 : 4],
    ["partly_cloudy", 4],
    ["cloudy", 3],
    ["drizzle", winter ? 3 : 1.5],
    ["rain", winter ? 3 : 1.5],
    ["fog", 0.6],
    ["thunderstorm", 0.4],
    ["snow", home === "Queenstown" || home === "Wānaka" ? (winter ? 1.5 : 0) : 0],
  ]);
  const temperatureC = Math.round(clamp(seasonalMean + random.normal() * 3 - (condition === "rain" ? 2 : 0), -5, 35));
  return { condition, temperatureC, placeName: random.chance(0.85) ? home : random.pick(PLACES) };
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const COMMENTS_HIGH = [
  "love this!!", "this is so wholesome", "omg yes", "living vicariously through you", "best day ever vibes",
  "so happy for you 🥹", "invite me next time!!", "this made my day", "iconic", "obsessed", "we love to see it",
] as const;
const COMMENTS_MID = [
  "same honestly", "relatable", "ooh what did you think?", "need the recommendation", "haha classic",
  "solid day", "hope tomorrow's even better", "fair enough", "the consistency 👏", "noted for later",
] as const;
const COMMENTS_LOW = [
  "sending hugs 🫂", "here if you want to talk", "proud of you for getting through it", "want to get coffee this week?",
  "you've got this", "be gentle with yourself", "ugh I'm sorry", "call me if you need",
] as const;
const COMMENTS_PHOTO = [
  "where is this??", "the photo 😍", "wallpaper material", "the lighting!!", "need to go here", "how is this real",
] as const;
const REPLIES = [
  "haha thank you!", "yes let's!!", "will send you the link", "thanks, means a lot 🥹", "you'd love it", "next time for sure",
  "omg right", "😂😂", "can confirm", "it was so good", "appreciate you", "deal",
] as const;

export function makeComment(random: Random, rating: number, hasPhotos: boolean): string {
  if (hasPhotos && random.chance(0.35)) return random.pick(COMMENTS_PHOTO);
  if (rating <= 4) return random.pick(COMMENTS_LOW);
  if (rating >= 8) return random.pick(COMMENTS_HIGH);
  return random.pick(COMMENTS_MID);
}

export function makeReply(random: Random): string {
  return random.pick(REPLIES);
}

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

/** Each line is [speaker, text]; speaker 0 opens the exchange. */
export const DIALOGUES: ReadonlyArray<ReadonlyArray<readonly [0 | 1, string]>> = [
  [[0, "are you coming to the library tomorrow?"], [1, "yeah probably from 10"], [0, "save me a seat on level 4 🙏"], [1, "always"]],
  [[0, "saw your dayli about the hike!! where was that"], [1, "Te Henga walkway! it's so good"], [0, "omg adding it to the list"], [1, "we should go together next weekend"], [0, "YES"]],
  [[0, "dumplings tonight?"], [1, "say less"], [1, "7pm?"], [0, "perfect, I'll book"]],
  [[0, "how did the exam go??"], [1, "honestly better than I thought"], [1, "question 3 was evil though"], [0, "so proud of you!!"], [1, "🥹 thank you"]],
  [[0, "ok I finally started The Bear"], [1, "AND???"], [0, "I'm stressed but I love it"], [1, "wait till season 2 ep 7"]],
  [[0, "random but I miss you"], [1, "miss you too!! coffee this week?"], [0, "thursday morning?"], [1, "it's a date ☕️"]],
  [[0, "did you see the sunset tonight"], [1, "YES from the ferry"], [1, "unreal"], [0, "auckland showing off"]],
  [[0, "happy birthday!!! 🎉🎂"], [1, "aaa thank you!!"], [0, "hope it's a good one, drinks on me next time"], [1, "holding you to that"]],
  [[0, "can I borrow your camping stove this weekend?"], [1, "of course, grab it whenever"], [0, "legend"], [0, "will return it clean I promise"], [1, "lol you'd better"]],
  [[0, "gym at 6 tomorrow?"], [1, "6?? in the morning??"], [0, "it's leg day, we suffer together"], [1, "fine. but you're buying coffee after"]],
  [[0, "thinking of adopting a cat"], [1, "DO IT"], [1, "send me photos of every candidate"], [0, "SPCA tomorrow, will report back"]],
  [[0, "your post today made me cry a little (good way)"], [1, "aw 🥹 it was a big day"], [0, "you deserve all of it"]],
  [[0, "are we still on for saturday?"], [1, "yes! still keen for the markets?"], [0, "yes, then brunch"], [1, "perfect"]],
  [[0, "help what do I cook for 6 people"], [1, "big pot of curry, never fails"], [0, "genius"], [1, "and buy naan don't make it"]],
  [[0, "I got the job!!!"], [1, "WHAT"], [1, "CONGRATS!!!"], [0, "still processing"], [1, "celebrating this weekend no excuses"]],
  [[0, "lecture notes from today pls 🥲"], [1, "sending now"], [1, "she said the test is open book btw"], [0, "you're a lifesaver"]],
  [[0, "song rec of the day: From The Start"], [1, "laufey supremacy"], [0, "always"]],
  [[0, "rough day, can I vent"], [1, "always, call?"], [0, "yeah give me 5"], [1, "ok 🫂"]],
  [[0, "beach after class?"], [1, "if the sun stays out yes"], [0, "it will, I manifested it"], [1, "lol ok see you at 3"]],
  [[0, "did you post your dayli yet"], [1, "not yet, prompt is hard today"], [0, "same lol"], [1, "posting at 11:58 like always"]],
  [[0, "flat inspection tomorrow 😭"], [1, "nooo good luck"], [0, "the oven is a crime scene"], [1, "baking soda and vinegar, trust"]],
  [[0, "photos from the weekend!"], [1, "omg these are so good"], [1, "can I post the one of us at the lookout"], [0, "obviously"]],
  [[0, "how's your mum doing?"], [1, "much better, thanks for asking"], [0, "give her my love"], [1, "will do ❤️"]],
  [[0, "climbing tonight?"], [1, "yes! my fingers need it"], [0, "meet at 6:30"], [1, "see you there"]],
];

export const MESSAGE_REQUEST_OPENERS = [
  "hey! I think we were in the same COMPSCI tutorial, loved your post about the hike",
  "hi! saw you on Dayli through a friend, your sunset photos are amazing",
  "hey sorry if random, are you the one who runs the climbing club socials?",
  "hello! we met at the gig on K Road last month, it was so fun",
] as const;
