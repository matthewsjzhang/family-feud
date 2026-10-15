// Accuracy fixture for the answer matcher: real surveys from the bank (picked at
// random, seed 42) and the kinds of things players actually say.
// expected: the board answer index (0 = #1), or null for "not on the board".

export interface MatchCase {
  guess: string;
  expected: number | null;
}

export interface SurveyCases {
  surveyId: string;
  /** Plurals, tenses, extra words, typos, abbreviations, one half of a slash, etc. */
  regular: MatchCase[];
  /** Synonyms a judge would accept but plain text matching can't know. Never gated on recall. */
  synonyms?: MatchCase[];
}

export const MATCH_FIXTURE: SurveyCases[] = [
  {
    // 0:BIG/BAGGY 1:TIGHT/SNUG 2:DIRTY/SMELLY 3:SMALL/SKIMPY 4:FULL OF HOLES
    surveyId: "s18-a5-053",
    regular: [
      { guess: "baggy", expected: 0 },
      { guess: "too big", expected: 0 },
      { guess: "tight", expected: 1 },
      { guess: "snug", expected: 1 },
      { guess: "dirty", expected: 2 },
      { guess: "smelly", expected: 2 },
      { guess: "small", expected: 3 },
      { guess: "skimpy", expected: 3 },
      { guess: "full of holes", expected: 4 },
      { guess: "has holes", expected: 4 },
      { guess: "colorful", expected: null },
      { guess: "expensive", expected: null },
    ],
  },
  {
    // 0:PIGGING OUT 1:SMOKING 2:LYING 3:SPEEDING 4:DRINKING 5:GOSSIPING
    surveyId: "s16-a6-145",
    regular: [
      { guess: "pigging out", expected: 0 },
      { guess: "smoke", expected: 1 },
      { guess: "lying", expected: 2 },
      { guess: "lies", expected: 2 },
      { guess: "speeding", expected: 3 },
      { guess: "speed", expected: 3 },
      { guess: "drink", expected: 4 },
      { guess: "gossip", expected: 5 },
      { guess: "cheating", expected: null },
    ],
    synonyms: [{ guess: "overeating", expected: 0 }],
  },
  {
    // 0:DRINKING/BODY SHOTS 1:DANCING 2:STRIPPING 3:SWAPPING SPIT 4:SINGING 5:DRUGS/GANJA
    surveyId: "s21-a6-063",
    regular: [
      { guess: "drinking", expected: 0 },
      { guess: "doing body shots", expected: 0 },
      { guess: "dance", expected: 1 },
      { guess: "dancing on tables", expected: 1 },
      { guess: "strip", expected: 2 },
      { guess: "swapping spit", expected: 3 },
      { guess: "singing karaoke", expected: 4 },
      { guess: "drugs", expected: 5 },
      { guess: "ganja", expected: 5 },
      { guess: "sleeping", expected: null },
    ],
    synonyms: [{ guess: "taking my clothes off", expected: 2 }],
  },
  {
    // 0:NO BREATH/MOVEMENT 1:NO PULSE 2:THEY'RE COLD 3:SKIN COLOR/PALE 4:THEY SMELL
    // 5:POKE/KICK THEM 6:HEADLESS/BLOODY 7:STIFF AS A BOARD
    surveyId: "s20-a8-003",
    regular: [
      { guess: "not breathing", expected: 0 },
      { guess: "no movement", expected: 0 },
      { guess: "no pulse", expected: 1 },
      { guess: "they're cold", expected: 2 },
      { guess: "cold", expected: 2 },
      { guess: "pale", expected: 3 },
      { guess: "skin color", expected: 3 },
      { guess: "smells bad", expected: 4 },
      { guess: "poke them", expected: 5 },
      { guess: "kick", expected: 5 },
      { guess: "headless", expected: 6 },
      { guess: "stiff", expected: 7 },
    ],
    synonyms: [{ guess: "no heartbeat", expected: 1 }],
  },
  {
    // 0:PUKE/A HAIRBALL 1:LICK SELF/BUTT 2:DROP A DEUCE/SPRAY 3:HOP ON TABLE/EAT
    // 4:MEOW/CRY/PURR 5:BEHEAD A MOUSE
    surveyId: "s20-a6-041",
    regular: [
      { guess: "throw up a hairball", expected: 0 },
      { guess: "puke", expected: 0 },
      { guess: "lick itself", expected: 1 },
      { guess: "lick its butt", expected: 1 },
      { guess: "spray", expected: 2 },
      { guess: "jump on the table", expected: 3 },
      { guess: "eat the food", expected: 3 },
      { guess: "meow", expected: 4 },
      { guess: "purring", expected: 4 },
      { guess: "scratch the guests", expected: null },
    ],
  },
  {
    // 0:POOL/HOT TUB 1:YELLOW MIATA/TRUCK 2:PET/CUTE BICHON 3:LOVER/NEW SPOUSE 4:TV/3-D
    // 5:BOAT/YACHT 6:RIDING MOWER
    surveyId: "s18-a7-201",
    regular: [
      { guess: "pool", expected: 0 },
      { guess: "a hot tub", expected: 0 },
      { guess: "truck", expected: 1 },
      { guess: "pet", expected: 2 },
      { guess: "lover", expected: 3 },
      { guess: "new spouse", expected: 3 },
      { guess: "3d tv", expected: 4 },
      { guess: "boat", expected: 5 },
      { guess: "yacht", expected: 5 },
      { guess: "riding mower", expected: 6 },
      { guess: "lawn mower", expected: 6 },
    ],
    synonyms: [{ guess: "dog", expected: 2 }],
  },
  {
    // 0:BAR/CLUB 1:WORK/OFFICE 2:AT BUD'S/NEIGHBOR'S 3:CASINO
    surveyId: "s18-a4-130",
    regular: [
      { guess: "the bar", expected: 0 },
      { guess: "a club", expected: 0 },
      { guess: "at work", expected: 1 },
      { guess: "his office", expected: 1 },
      { guess: "neighbor's house", expected: 2 },
      { guess: "the casino", expected: 3 },
      { guess: "casinos", expected: 3 },
      { guess: "the gym", expected: null },
      { guess: "church", expected: null },
    ],
  },
  {
    // 0:SNEEZE/COUGH/"AHEM" 1:TURN/LOOK AWAY 2:RUB EYES/FACE 3:LEAVE/WALK AWAY 4:YAWN
    // 5:EAT AN ONION 6:HOLD IT ALL IN 7:BITE LIP
    surveyId: "s17-a8-031",
    regular: [
      { guess: "sneeze", expected: 0 },
      { guess: "fake a cough", expected: 0 },
      { guess: "look away", expected: 1 },
      { guess: "turn away", expected: 1 },
      { guess: "rub my eyes", expected: 2 },
      { guess: "rubbing eyes", expected: 2 },
      { guess: "walk away", expected: 3 },
      { guess: "leave the room", expected: 3 },
      { guess: "yawning", expected: 4 },
      { guess: "onion", expected: 5 },
      { guess: "bite my lip", expected: 7 },
      { guess: "biting lip", expected: 7 },
      { guess: "laugh", expected: null },
    ],
    synonyms: [{ guess: "clear my throat", expected: 0 }],
  },
  {
    // 0:PINA COLADA 1:XL SCALPEL 2:CHAIN SAW 3:FOOD/SLOPPY JOE 4:INSTRUCTIONS 5:A JOINT
    surveyId: "s24-a6-145",
    regular: [
      { guess: "a pina colada", expected: 0 },
      { guess: "scalpel", expected: 1 },
      { guess: "big scalpel", expected: 1 },
      { guess: "chainsaw", expected: 2 },
      { guess: "sloppy joe", expected: 3 },
      { guess: "food", expected: 3 },
      { guess: "instruction manual", expected: 4 },
      { guess: "joint", expected: 5 },
      { guess: "a knife", expected: null },
    ],
  },
  {
    // 0:FAINT 1:BLOW CHUNKS 2:FORGET THEM/MESS UP 3:DIE 4:RUN/GET COLD FEET 5:CRY 6:JAIL/FOR LIFE
    surveyId: "s16-a7-097",
    regular: [
      { guess: "faint", expected: 0 },
      { guess: "blow chunks", expected: 1 },
      { guess: "forget", expected: 2 },
      { guess: "mess up", expected: 2 },
      { guess: "die", expected: 3 },
      { guess: "run away", expected: 4 },
      { guess: "cold feet", expected: 4 },
      { guess: "crying", expected: 5 },
      { guess: "jail", expected: 6 },
      { guess: "laugh", expected: null },
    ],
    synonyms: [
      { guess: "pass out", expected: 0 },
      { guess: "throw up", expected: 1 },
    ],
  },
  {
    // 0:KISSED/TONGUED ME 1:COPPED A FEEL 2:BURPED 3:LAUGHED/SMILED 4:SNEEZED 5:CHEWED/SPIT GUM 6:FAINTED
    surveyId: "s16-a7-065",
    regular: [
      { guess: "kiss me", expected: 0 },
      { guess: "copped a feel", expected: 1 },
      { guess: "burp", expected: 2 },
      { guess: "laughed", expected: 3 },
      { guess: "smiled", expected: 3 },
      { guess: "sneeze", expected: 4 },
      { guess: "spit gum", expected: 5 },
      { guess: "chewing gum", expected: 5 },
      { guess: "fainted", expected: 6 },
      { guess: "bit me", expected: null },
    ],
  },
  {
    // 0:STOCK MARKET 1:BIRD/SWAN 2:SWIMMER/DIVER 3:BOXER/WRESTLER 4:AIRPLANE
    surveyId: "s20-a5-070",
    regular: [
      { guess: "the stock market", expected: 0 },
      { guess: "stocks", expected: 0 },
      { guess: "a bird", expected: 1 },
      { guess: "swan", expected: 1 },
      { guess: "a swimmer", expected: 2 },
      { guess: "diver", expected: 2 },
      { guess: "boxer", expected: 3 },
      { guess: "wrestler", expected: 3 },
      { guess: "airplane", expected: 4 },
      { guess: "the economy", expected: null },
    ],
    synonyms: [{ guess: "a plane", expected: 4 }],
  },
  {
    // 0:PARENTS 1:BANK/LENDER 2:SPOUSE/MATE 3:TEACHER/MENTOR
    surveyId: "s26-a4-184",
    regular: [
      { guess: "my parents", expected: 0 },
      { guess: "the bank", expected: 1 },
      { guess: "lender", expected: 1 },
      { guess: "my spouse", expected: 2 },
      { guess: "teacher", expected: 3 },
      { guess: "mentor", expected: 3 },
      { guess: "god", expected: null },
    ],
    synonyms: [
      { guess: "mom and dad", expected: 0 },
      { guess: "my wife", expected: 2 },
    ],
  },
  {
    // 0:LASAGNA 1:SPAGHETTI 2:PASTA 3:PIZZA 4:LINGUINE
    surveyId: "s20-a5-099",
    regular: [
      { guess: "lasagna", expected: 0 },
      { guess: "lasagne", expected: 0 },
      { guess: "spagetti", expected: 1 },
      { guess: "pasta", expected: 2 },
      { guess: "pizza pie", expected: 3 },
      { guess: "linguini", expected: 4 },
      { guess: "ravioli", expected: null },
      { guess: "meatballs", expected: null },
    ],
  },
  {
    // 0:BIG MAC 1:MCNUGGETS 2:QUARTER POUNDER 3:MCDOUBLE 4:MCRIB 5:MCFLURRY
    surveyId: "s21-a6-114",
    regular: [
      { guess: "the big mac", expected: 0 },
      { guess: "mcnugget", expected: 1 },
      { guess: "chicken mcnuggets", expected: 1 },
      { guess: "quarter pounder", expected: 2 },
      { guess: "mc double", expected: 3 },
      { guess: "the mcrib", expected: 4 },
      { guess: "mcflurry", expected: 5 },
      { guess: "happy meal", expected: null },
      { guess: "fries", expected: null },
    ],
  },
  {
    // 0:CHRISTMAS 1:VALENTINE'S DAY 2:THANKSGIVING 3:NEW YEAR'S/EVE
    surveyId: "s16-a4-109",
    regular: [
      { guess: "christmas", expected: 0 },
      { guess: "valentines day", expected: 1 },
      { guess: "valentine's", expected: 1 },
      { guess: "thanksgiving", expected: 2 },
      { guess: "new year's eve", expected: 3 },
      { guess: "new years", expected: 3 },
      { guess: "halloween", expected: null },
      { guess: "easter", expected: null },
    ],
    synonyms: [{ guess: "xmas", expected: 0 }],
  },
  {
    // 0:CLOTHES/SHOES 1:MAN/CHRIS HEMSWORTH 2:PURSE 3:MONEY/THE CHECK
    surveyId: "s19-a4-199",
    regular: [
      { guess: "clothes", expected: 0 },
      { guess: "shoes", expected: 0 },
      { guess: "a man", expected: 1 },
      { guess: "chris hemsworth", expected: 1 },
      { guess: "a purse", expected: 2 },
      { guess: "the check", expected: 3 },
      { guess: "money", expected: 3 },
      { guess: "makeup", expected: null },
    ],
    synonyms: [{ guess: "handbag", expected: 2 }],
  },
  {
    // 0:PREGGO/KIDS 1:THEY'RE 95 2:GREEN CARD 3:IN LOVE/CAN'T WAIT
    surveyId: "s25-a4-056",
    regular: [
      { guess: "kids", expected: 0 },
      { guess: "green card", expected: 2 },
      { guess: "in love", expected: 3 },
      { guess: "can't wait", expected: 3 },
      { guess: "money", expected: null },
      { guess: "tax reasons", expected: null },
    ],
    synonyms: [{ guess: "pregnant", expected: 0 }],
  },
  {
    // 0:VIXEN 1:DANCER 2:PRANCER 3:CUPID 4:BLITZEN 5:DASHER 6:RUDOLPH 7:DONNER
    surveyId: "s22-a8-003",
    regular: [
      { guess: "vixen", expected: 0 },
      { guess: "dancer", expected: 1 },
      { guess: "prancer", expected: 2 },
      { guess: "cupid", expected: 3 },
      { guess: "blitzen", expected: 4 },
      { guess: "dasher", expected: 5 },
      { guess: "rudolf", expected: 6 },
      { guess: "donner", expected: 7 },
      { guess: "comet", expected: null },
      { guess: "cupcake", expected: null },
    ],
  },
  {
    // 0:LIFEGUARD 1:CAR WASH 2:FIREFIGHTER 3:DIVER/SWIMMER 4:FISHERMAN 5:SAILOR
    surveyId: "s24-a6-157",
    regular: [
      { guess: "life guard", expected: 0 },
      { guess: "car wash worker", expected: 1 },
      { guess: "firefighter", expected: 2 },
      { guess: "scuba diver", expected: 3 },
      { guess: "fishermen", expected: 4 },
      { guess: "sailor", expected: 5 },
      { guess: "plumber", expected: null },
      { guess: "dishwasher", expected: null },
    ],
    synonyms: [{ guess: "fireman", expected: 2 }],
  },
  {
    // 0:RESIGNATION/"G'BYE" 1:THE BIRD 2:NOTHING 3:MONEY/ALL OF IT 4:GIFT CARD 5:FOOD/PIZZA HUT
    surveyId: "s21-a6-109",
    regular: [
      { guess: "my resignation letter", expected: 0 },
      { guess: "the bird", expected: 1 },
      { guess: "nothing", expected: 2 },
      { guess: "money", expected: 3 },
      { guess: "a gift card", expected: 4 },
      { guess: "pizza", expected: 5 },
      { guess: "a raise", expected: null },
      { guess: "a vacation", expected: null },
    ],
    synonyms: [{ guess: "the middle finger", expected: 1 }],
  },
];
