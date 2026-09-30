/**
 * The app's own words in English and five Indian languages. Kept in the
 * bundle, so a language works offline like everything else. The programme's
 * content (talk titles, abstracts, names) is the organiser's and is not
 * translated.
 *
 * The Indic strings were written without a native-speaker review; treat them
 * as a first draft to be checked before relying on them.
 */

export const LOCALES = ['en', 'hi', 'kn', 'ta', 'te', 'ml'] as const;
export type Locale = (typeof LOCALES)[number];

/** Each language named in its own script, as a picker should show it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  hi: 'हिन्दी',
  kn: 'ಕನ್ನಡ',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  ml: 'മലയാളം',
};

type Dictionary = Record<string, string>;

export const en = {
  'nav.schedule': 'Schedule',
  'nav.plan': 'Plan',
  'nav.map': 'Map',
  'nav.explore': 'Explore',
  'nav.scan': 'Scan',
  'nav.connect': 'Connect',
  'view.timeline': 'Timeline',
  'view.rooms': 'Rooms',
  'view.agenda': 'Agenda',
  'now.happening': 'Happening now',
  'now.starts': 'Starts {when}',
  'now.now': 'Now',
  'now.freeUntil': 'Free until {time}',
  'now.yourPlan': 'Your plan',
  'go.going': "You're going",
  'go.upNext': 'Up next',
  'schedule.day': 'Day {n}',
  'schedule.filters': 'Filters',
  'schedule.search': 'Search sessions…',
  'schedule.allRooms': 'All rooms',
  'schedule.everything': 'Everything',
  'schedule.sessions': '{n} sessions',
  'schedule.session': '1 session',
  'settings.language': 'Language',
  'settings.languageNote':
    'Menus and schedule labels. Talk titles and abstracts stay as the organiser published them.',
} satisfies Dictionary;

export type MessageKey = keyof typeof en;

export const dictionaries: Record<Exclude<Locale, 'en'>, Record<MessageKey, string>> = {
  hi: {
    'nav.schedule': 'कार्यक्रम',
    'nav.plan': 'योजना',
    'nav.map': 'नक्शा',
    'nav.explore': 'खोजें',
    'nav.scan': 'स्कैन',
    'nav.connect': 'जुड़ें',
    'view.timeline': 'समयरेखा',
    'view.rooms': 'कक्ष',
    'view.agenda': 'कार्यसूची',
    'now.happening': 'अभी चल रहा है',
    'now.starts': '{when} से शुरू',
    'now.now': 'अभी',
    'now.freeUntil': '{time} तक खाली',
    'now.yourPlan': 'आपकी योजना',
    'go.going': 'आप जा रहे हैं',
    'go.upNext': 'अगला',
    'schedule.day': 'दिन {n}',
    'schedule.filters': 'फ़िल्टर',
    'schedule.search': 'सत्र खोजें…',
    'schedule.allRooms': 'सभी कक्ष',
    'schedule.everything': 'सब कुछ',
    'schedule.sessions': '{n} सत्र',
    'schedule.session': '1 सत्र',
    'settings.language': 'भाषा',
    'settings.languageNote':
      'मेनू और कार्यक्रम के लेबल। वार्ताओं के शीर्षक और विवरण आयोजक द्वारा प्रकाशित रूप में ही रहते हैं।',
  },
  kn: {
    'nav.schedule': 'ವೇಳಾಪಟ್ಟಿ',
    'nav.plan': 'ಯೋಜನೆ',
    'nav.map': 'ನಕ್ಷೆ',
    'nav.explore': 'ಅನ್ವೇಷಿಸಿ',
    'nav.scan': 'ಸ್ಕ್ಯಾನ್',
    'nav.connect': 'ಸಂಪರ್ಕ',
    'view.timeline': 'ಸಮಯರೇಖೆ',
    'view.rooms': 'ಕೊಠಡಿಗಳು',
    'view.agenda': 'ಕಾರ್ಯಸೂಚಿ',
    'now.happening': 'ಈಗ ನಡೆಯುತ್ತಿದೆ',
    'now.starts': '{when} ರಿಂದ ಆರಂಭ',
    'now.now': 'ಈಗ',
    'now.freeUntil': '{time} ವರೆಗೆ ಖಾಲಿ',
    'now.yourPlan': 'ನಿಮ್ಮ ಯೋಜನೆ',
    'go.going': 'ನೀವು ಹೋಗುತ್ತಿದ್ದೀರಿ',
    'go.upNext': 'ಮುಂದಿನದು',
    'schedule.day': 'ದಿನ {n}',
    'schedule.filters': 'ಫಿಲ್ಟರ್‌ಗಳು',
    'schedule.search': 'ಸೆಷನ್‌ಗಳನ್ನು ಹುಡುಕಿ…',
    'schedule.allRooms': 'ಎಲ್ಲಾ ಕೊಠಡಿಗಳು',
    'schedule.everything': 'ಎಲ್ಲವೂ',
    'schedule.sessions': '{n} ಸೆಷನ್‌ಗಳು',
    'schedule.session': '1 ಸೆಷನ್',
    'settings.language': 'ಭಾಷೆ',
    'settings.languageNote':
      'ಮೆನುಗಳು ಮತ್ತು ವೇಳಾಪಟ್ಟಿಯ ಲೇಬಲ್‌ಗಳು. ಮಾತುಕತೆಗಳ ಶೀರ್ಷಿಕೆ ಮತ್ತು ವಿವರಣೆಗಳು ಆಯೋಜಕರು ಪ್ರಕಟಿಸಿದಂತೆಯೇ ಇರುತ್ತವೆ.',
  },
  ta: {
    'nav.schedule': 'அட்டவணை',
    'nav.plan': 'திட்டம்',
    'nav.map': 'வரைபடம்',
    'nav.explore': 'தேடு',
    'nav.scan': 'ஸ்கேன்',
    'nav.connect': 'இணை',
    'view.timeline': 'காலவரிசை',
    'view.rooms': 'அரங்குகள்',
    'view.agenda': 'நிரல்',
    'now.happening': 'இப்போது நடக்கிறது',
    'now.starts': '{when} முதல் தொடக்கம்',
    'now.now': 'இப்போது',
    'now.freeUntil': '{time} வரை காலி',
    'now.yourPlan': 'உங்கள் திட்டம்',
    'go.going': 'நீங்கள் செல்கிறீர்கள்',
    'go.upNext': 'அடுத்து',
    'schedule.day': 'நாள் {n}',
    'schedule.filters': 'வடிகட்டிகள்',
    'schedule.search': 'அமர்வுகளைத் தேடு…',
    'schedule.allRooms': 'அனைத்து அரங்குகள்',
    'schedule.everything': 'அனைத்தும்',
    'schedule.sessions': '{n} அமர்வுகள்',
    'schedule.session': '1 அமர்வு',
    'settings.language': 'மொழி',
    'settings.languageNote':
      'மெனுக்கள் மற்றும் அட்டவணை லேபிள்கள். உரைகளின் தலைப்புகளும் சுருக்கங்களும் ஏற்பாட்டாளர் வெளியிட்டபடியே இருக்கும்.',
  },
  te: {
    'nav.schedule': 'షెడ్యూల్',
    'nav.plan': 'ప్లాన్',
    'nav.map': 'మ్యాప్',
    'nav.explore': 'అన్వేషించు',
    'nav.scan': 'స్కాన్',
    'nav.connect': 'కనెక్ట్',
    'view.timeline': 'టైమ్‌లైన్',
    'view.rooms': 'గదులు',
    'view.agenda': 'అజెండా',
    'now.happening': 'ఇప్పుడు జరుగుతోంది',
    'now.starts': '{when} నుండి ప్రారంభం',
    'now.now': 'ఇప్పుడు',
    'now.freeUntil': '{time} వరకు ఖాళీ',
    'now.yourPlan': 'మీ ప్లాన్',
    'go.going': 'మీరు వెళ్తున్నారు',
    'go.upNext': 'తదుపరి',
    'schedule.day': 'రోజు {n}',
    'schedule.filters': 'ఫిల్టర్లు',
    'schedule.search': 'సెషన్‌లను వెతకండి…',
    'schedule.allRooms': 'అన్ని గదులు',
    'schedule.everything': 'అన్నీ',
    'schedule.sessions': '{n} సెషన్‌లు',
    'schedule.session': '1 సెషన్',
    'settings.language': 'భాష',
    'settings.languageNote':
      'మెనూలు మరియు షెడ్యూల్ లేబుళ్ళు. ప్రసంగాల శీర్షికలు, సారాంశాలు నిర్వాహకులు ప్రచురించినట్లుగానే ఉంటాయి.',
  },
  ml: {
    'nav.schedule': 'ഷെഡ്യൂൾ',
    'nav.plan': 'പ്ലാൻ',
    'nav.map': 'മാപ്പ്',
    'nav.explore': 'തിരയുക',
    'nav.scan': 'സ്കാൻ',
    'nav.connect': 'കണക്റ്റ്',
    'view.timeline': 'ടൈംലൈൻ',
    'view.rooms': 'ഹാളുകൾ',
    'view.agenda': 'അജണ്ട',
    'now.happening': 'ഇപ്പോൾ നടക്കുന്നത്',
    'now.starts': '{when} മുതൽ ആരംഭം',
    'now.now': 'ഇപ്പോൾ',
    'now.freeUntil': '{time} വരെ ഒഴിവ്',
    'now.yourPlan': 'നിങ്ങളുടെ പ്ലാൻ',
    'go.going': 'നിങ്ങൾ പോകുന്നു',
    'go.upNext': 'അടുത്തത്',
    'schedule.day': 'ദിവസം {n}',
    'schedule.filters': 'ഫിൽട്ടറുകൾ',
    'schedule.search': 'സെഷനുകൾ തിരയുക…',
    'schedule.allRooms': 'എല്ലാ ഹാളുകളും',
    'schedule.everything': 'എല്ലാം',
    'schedule.sessions': '{n} സെഷനുകൾ',
    'schedule.session': '1 സെഷൻ',
    'settings.language': 'ഭാഷ',
    'settings.languageNote':
      'മെനുകളും ഷെഡ്യൂൾ ലേബലുകളും. പ്രഭാഷണങ്ങളുടെ തലക്കെട്ടുകളും സംഗ്രഹങ്ങളും സംഘാടകർ പ്രസിദ്ധീകരിച്ചതുപോലെ തന്നെ.',
  },
};

/** For tests: every language has every key, and no placeholder is lost. */
export const __dictionaries = { en, ...dictionaries } as Record<Locale, Record<string, string>>;
