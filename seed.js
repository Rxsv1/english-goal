'use strict';

// Starter lessons, inserted only when the database is empty.
const lessons = [
  {
    slug: 'greetings',
    title: 'Greetings',
    level: 'A1',
    emoji: '👋',
    description: 'Say hello, introduce yourself and say goodbye.',
    published: true,
    sentences: [
      { en: 'Hello, my name is Sara.' },
      { en: 'Nice to meet you.' },
      { en: 'How are you today?' },
      { en: 'I am fine, thank you.' },
      { en: 'Where are you from?' },
      { en: 'I am from Saudi Arabia.' },
      { en: 'See you tomorrow.' },
      { en: 'Have a nice day!' },
    ],
  },
  {
    slug: 'daily-routine',
    title: 'Daily Routine',
    level: 'A1',
    emoji: '⏰',
    description: 'Talk about what you do every day.',
    published: true,
    sentences: [
      { en: 'I wake up at six every morning.' },
      { en: 'I brush my teeth after breakfast.' },
      { en: 'My father drives me to school.' },
      { en: 'We have lunch at one o\'clock.' },
      { en: 'I do my homework in the afternoon.' },
      { en: 'She plays football with her friends.' },
      { en: 'We eat dinner together as a family.' },
      { en: 'I go to bed at ten o\'clock.' },
    ],
  },
  {
    slug: 'food-and-drinks',
    title: 'Food & Drinks',
    level: 'A1',
    emoji: '🍎',
    description: 'Order food and talk about what you like to eat.',
    published: true,
    sentences: [
      { en: 'I would like a cup of tea.' },
      { en: 'Can I have the menu, please?' },
      { en: 'My favourite food is rice and chicken.' },
      { en: 'Do you like spicy food?' },
      { en: 'This soup is very hot.' },
      { en: 'We need some milk and bread.' },
      { en: 'Apples are good for your health.' },
      { en: 'How much is this sandwich?' },
    ],
  },
  {
    slug: 'at-school',
    title: 'At School',
    level: 'A2',
    emoji: '🏫',
    description: 'Classroom language for students and teachers.',
    published: true,
    sentences: [
      { en: 'Please open your books to page ten.' },
      { en: 'Can you repeat the question, please?' },
      { en: 'I forgot my pencil at home.' },
      { en: 'Our teacher is very kind and helpful.' },
      { en: 'We have an English test on Monday.' },
      { en: 'May I go to the bathroom?' },
      { en: 'I don\'t understand this word.' },
      { en: 'Science is my favourite subject.' },
    ],
  },
  {
    slug: 'travel',
    title: 'Travel',
    level: 'A2',
    emoji: '✈️',
    description: 'Airports, hotels and asking for directions.',
    published: true,
    sentences: [
      { en: 'Where is the nearest bus station?' },
      { en: 'I booked a room for three nights.' },
      { en: 'Our flight leaves at nine in the morning.' },
      { en: 'Could you take a photo of us?' },
      { en: 'Turn left at the traffic lights.' },
      { en: 'I have lost my passport.' },
      { en: 'Is breakfast included in the price?' },
      { en: 'We are going to visit the museum.' },
    ],
  },
  {
    slug: 'past-weekend',
    title: 'Last Weekend',
    level: 'B1',
    emoji: '📅',
    description: 'Practise the past simple by telling a story.',
    published: true,
    sentences: [
      { en: 'Last weekend we visited our grandparents.' },
      { en: 'It was raining when we left the house.' },
      { en: 'My brother forgot to bring his jacket.' },
      { en: 'We watched an interesting film together.' },
      { en: 'Have you ever been to the desert?' },
      { en: 'I had never seen so many stars before.' },
      { en: 'We didn\'t get home until midnight.' },
      { en: 'It was the best weekend of the year.' },
    ],
  },
];

// Split each lesson into two units of four sentences.
const UNIT_TITLES = {
  "greetings": [
    "Saying hello",
    "Getting to know someone"
  ],
  "daily-routine": [
    "Morning",
    "Afternoon and evening"
  ],
  "food-and-drinks": [
    "At a caf\u00e9",
    "What we eat"
  ],
  "at-school": [
    "In the classroom",
    "School life"
  ],
  "travel": [
    "Getting around",
    "At the hotel"
  ],
  "past-weekend": [
    "What we did",
    "How it ended"
  ]
};
module.exports = lessons.map(l => {
  const [a, b] = UNIT_TITLES[l.slug];
  const half = Math.ceil(l.sentences.length / 2);
  const { sentences, ...rest } = l;
  return {
    ...rest,
    units: [
      { id: l.slug.replace(/-/g, '').slice(0, 10) + '1', title: a, sentences: sentences.slice(0, half) },
      { id: l.slug.replace(/-/g, '').slice(0, 10) + '2', title: b, sentences: sentences.slice(half) },
    ],
  };
});
