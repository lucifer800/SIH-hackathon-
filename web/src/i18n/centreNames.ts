import type { Lang } from "./strings";

export const CENTRE_NAMES: Record<Lang, Record<string, string>> = {
  pa: {
    "Raipur Procurement Centre": "ਰਾਏਪੁਰ ਖਰੀਦ ਕੇਂਦਰ",
    "Raikot Procurement Centre": "ਰਾਇਕੋਟ ਖਰੀਦ ਕੇਂਦਰ",
    "Khana Jargao Procurement Centre": "ਖਾਨਾ ਜਰਗਾਓ ਖਰੀਦ ਕੇਂਦਰ",
    "Khanna": "ਖੰਨਾ",
    "Jagraon": "ਜਾਗਰਾਓਂ",
    "Raikot": "ਰਾਇਕੋਟ",
    "Jagraon Procurement Centre": "ਜਾਗਰਾਓਂ ਖਰੀਦ ਕੇਂਦਰ",
    "Mullanpur Procurement Centre": "ਮੁਲਾਂਪੁਰ ਖਰੀਦ ਕੇਂਦਰ",
    "Pune Procurement Centre": "ਪੁਣੇ ਖਰੀਦ ਕੇਂਦਰ",
    "Mumbai Procurement Centre": "ਮੁੰਬਈ ਖਰੀਦ ਕੇਂਦਰ",
  },
  hi: {
    "Raipur Procurement Centre": "रायपुर खरीद केंद्र",
    "Raikot Procurement Centre": "रायकोट खरीद केंद्र",
    "Khana Jargao Procurement Centre": "खाना जरगाओ खरीद केंद्र",
    "Khanna": "खन्ना",
    "Jagraon": "जाग्रांव",
    "Raikot": "रायकोट",
    "Jagraon Procurement Centre": "जाग्रांव खरीद केंद्र",
    "Mullanpur Procurement Centre": "मुल्लानपुर खरीद केंद्र",
    "Pune Procurement Centre": "पुणे खरीद केंद्र",
    "Mumbai Procurement Centre": "मुंबई खरीद केंद्र",
  },
  en: {
    "Raipur Procurement Centre": "Raipur Procurement Centre",
    "Raikot Procurement Centre": "Raikot Procurement Centre",
    "Khana Jargao Procurement Centre": "Khana Jargao Procurement Centre",
    "Khanna": "Khanna",
    "Jagraon": "Jagraon",
    "Raikot": "Raikot",
    "Jagraon Procurement Centre": "Jagraon Procurement Centre",
    "Mullanpur Procurement Centre": "Mullanpur Procurement Centre",
    "Pune Procurement Centre": "Pune Procurement Centre",
    "Mumbai Procurement Centre": "Mumbai Procurement Centre",
  },
};

export function translateCentreName(name: string, lang: Lang): string {
  return CENTRE_NAMES[lang][name] ?? name;
}
