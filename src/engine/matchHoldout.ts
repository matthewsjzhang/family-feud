// Held-out accuracy check for the answer matcher. These surveys (random, seed
// 2026) and guesses were written AFTER the matcher was built and are never used
// to tune it, so they measure how it does on answers it has not seen.

import type { SurveyCases } from "./matchFixture";

export const MATCH_HOLDOUT: SurveyCases[] = [
  {
    // 0:TUNES/KARAOKE 1:DRINK/BEER PONG 2:LAUGH/SMILE 3:DANCE/LINE DANCE 4:TALK/STORIES 5:EAT/BY MY CORPSE
    surveyId: "s18-a6-068",
    regular: [
      { guess: "sing karaoke", expected: 0 },
      { guess: "play beer pong", expected: 1 },
      { guess: "drinking", expected: 1 },
      { guess: "laughing", expected: 2 },
      { guess: "line dancing", expected: 3 },
      { guess: "tell stories", expected: 4 },
      { guess: "eat", expected: 5 },
      { guess: "play games", expected: null },
    ],
    synonyms: [{ guess: "music", expected: 0 }],
  },
  {
    // 0:SNORES 1:HOGS BED/COVERS 2:CUTS THE CHEESE 3:TOO WARM 4:BORING/SICK OF 'EM 5:RESTLESS/CAN'T SLEEP
    surveyId: "s22-a6-017",
    regular: [
      { guess: "snoring", expected: 0 },
      { guess: "he snores", expected: 0 },
      { guess: "hogs the covers", expected: 1 },
      { guess: "steals the blanket", expected: null },
      { guess: "cutting the cheese", expected: 2 },
      { guess: "too hot", expected: null },
      { guess: "boring", expected: 4 },
      { guess: "restless", expected: 5 },
      { guess: "can't sleep", expected: 5 },
      { guess: "talks in sleep", expected: null },
    ],
    synonyms: [
      { guess: "farting", expected: 2 },
      { guess: "kicks", expected: 5 },
    ],
  },
  {
    // 0:BOOZE/BEER 1:BOOBS 2:BONG 3:BUTTS
    surveyId: "s26-a4-138",
    regular: [
      { guess: "beer", expected: 0 },
      { guess: "booze", expected: 0 },
      { guess: "boobies", expected: 1 },
      { guess: "a bong", expected: 2 },
      { guess: "butt", expected: 3 },
      { guess: "balloons", expected: null },
      { guess: "band", expected: null },
    ],
    synonyms: [{ guess: "bourbon", expected: 0 }],
  },
  {
    // 0:EXERCISE/SPORTS 1:WHOOPEE 2:WORK 3:HIS SHOWER 4:YARD WORK 5:CAMPING TRIP
    surveyId: "s26-a6-011",
    regular: [
      { guess: "exercising", expected: 0 },
      { guess: "playing sports", expected: 0 },
      { guess: "whoopee", expected: 1 },
      { guess: "a day at work", expected: 2 },
      { guess: "showering", expected: 3 },
      { guess: "yard work", expected: 4 },
      { guess: "camping", expected: 5 },
      { guess: "sleeping", expected: null },
    ],
    synonyms: [
      { guess: "the gym", expected: 0 },
      { guess: "mowing the lawn", expected: 4 },
    ],
  },
  {
    // 0:ICE/SNOW 1:POPSICLE/ICE CREAM 2:CORPSE 3:STONE/DIAMOND
    surveyId: "s18-a4-132",
    regular: [
      { guess: "ice cube", expected: 0 },
      { guess: "snow", expected: 0 },
      { guess: "popsicles", expected: 1 },
      { guess: "ice cream", expected: 1 },
      { guess: "a corpse", expected: 2 },
      { guess: "a rock", expected: null },
      { guess: "diamonds", expected: 3 },
      { guess: "metal", expected: null },
    ],
    synonyms: [{ guess: "dead body", expected: 2 }],
  },
  {
    // 0:DENTIST 1:EYE DOCTOR 2:SHRINK 3:FOOT DOCTOR 4:VETERINARIAN 5:EAR, NOSE & THROAT
    surveyId: "s20-a6-042",
    regular: [
      { guess: "the dentist", expected: 0 },
      { guess: "eye doctor", expected: 1 },
      { guess: "a shrink", expected: 2 },
      { guess: "foot doctor", expected: 3 },
      { guess: "veterinarian", expected: 4 },
      { guess: "ear nose and throat", expected: 5 },
      { guess: "pediatrician", expected: null },
    ],
    synonyms: [
      { guess: "optometrist", expected: 1 },
      { guess: "psychiatrist", expected: 2 },
      { guess: "podiatrist", expected: 3 },
      { guess: "vet", expected: 4 },
    ],
  },
  {
    // 0:KIDNEY 1:EAR 2:TOE 3:FINGER 4:BOOB 5:NAD/BRO GLOBE
    surveyId: "s24-a6-124",
    regular: [
      { guess: "a kidney", expected: 0 },
      { guess: "ear", expected: 1 },
      { guess: "toes", expected: 2 },
      { guess: "a finger", expected: 3 },
      { guess: "boob", expected: 4 },
      { guess: "lung", expected: null },
      { guess: "eye", expected: null },
    ],
    synonyms: [{ guess: "testicle", expected: 5 }],
  },
  {
    // 0:FARTS/THE RUNS 1:SHE SAYS NO 2:LOSES RING 3:MATE/EX SHOWS UP 4:RAIN/LIGHTN'G STRIKE
    // 5:PHONE RINGS 6:HIS PANTS RIP 7:FAINTS
    surveyId: "s25-a8-113",
    regular: [
      { guess: "farting", expected: 0 },
      { guess: "she says no", expected: 1 },
      { guess: "lose the ring", expected: 2 },
      { guess: "his ex shows up", expected: 3 },
      { guess: "rain", expected: 4 },
      { guess: "lightning", expected: 4 },
      { guess: "his phone rings", expected: 5 },
      { guess: "pants rip", expected: 6 },
      { guess: "fainting", expected: 7 },
      { guess: "trips", expected: null },
    ],
    synonyms: [
      { guess: "she says no way", expected: 1 },
      { guess: "drops the ring", expected: 2 },
    ],
  },
  {
    // 0:TAKEN/HERE ALONE? 1:PHONE #? 2:WHAT'S YOUR SIGN? 3:WANT A DRINK? 4:COME HERE OFTEN?
    // 5:NAME? 6:AGE/LEGAL? 7:WHERE BEEN ALL LIFE?
    surveyId: "s24-a8-075",
    regular: [
      { guess: "are you here alone", expected: 0 },
      { guess: "can I have your phone number", expected: 1 },
      { guess: "what's your sign", expected: 2 },
      { guess: "do you want a drink", expected: 3 },
      { guess: "do you come here often", expected: 4 },
      { guess: "what's your name", expected: 5 },
      { guess: "how old are you", expected: null },
      { guess: "where have you been all my life", expected: 7 },
    ],
    synonyms: [
      { guess: "are you single", expected: 0 },
      { guess: "can I buy you a drink", expected: 3 },
    ],
  },
  {
    // 0:WIPE IT OFF 1:HIT THEM 2:LEAVE/WALK AWAY 3:THROW ONE AT THEM 4:GET MAD/YELL/CUSS
    // 5:LICK IT OFF! YUM! 6:LAUGH
    surveyId: "s20-a7-123",
    regular: [
      { guess: "wipe my face", expected: 0 },
      { guess: "hit them", expected: 1 },
      { guess: "punch them", expected: null },
      { guess: "walk away", expected: 2 },
      { guess: "throw a drink back", expected: 3 },
      { guess: "yell at them", expected: 4 },
      { guess: "get mad", expected: 4 },
      { guess: "lick it off", expected: 5 },
      { guess: "laugh", expected: 6 },
      { guess: "cry", expected: null },
    ],
    synonyms: [
      { guess: "slap them", expected: 1 },
      { guess: "curse", expected: 4 },
    ],
  },
];
