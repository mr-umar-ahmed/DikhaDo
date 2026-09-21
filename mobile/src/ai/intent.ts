/**
 * What did the person say is broken? Runs on the phone: a lexicon, not a language model.
 * People mix languages and scripts freely ("fan kharab hai", "पंखा नहीं चल रहा", "ఫ్యాన్ తిరగడం లేదు"),
 * and speech recognisers return either script, so every entry carries native and romanised forms.
 * A table is also auditable: a judge or a field worker can read exactly why a phrase routed where it did.
 *
 * Adding a language is adding words here. Nothing else changes.
 */
export type Intent = { code: string; matched: string[] };

// Order matters only for ties: more specific problems first.
const lexicon: [code: string, words: string[]][] = [
  ['fan_dead', ['fan', 'pankha', 'pankhe', 'पंखा', 'पंखे', 'फैन', 'ఫ్యాన్', 'ceiling fan', 'table fan', 'cooler fan']],
  ['cooler_fridge', ['fridge', 'refrigerator', 'freezer', 'cooler', 'फ्रिज', 'कूलर', 'ఫ్రిజ్', 'కూలర్']],
  ['geyser_install', ['geyser', 'geezer', 'water heater', 'गीज़र', 'गीजर', 'గీజర్', 'garam pani', 'गरम पानी']],
  ['wiring_fault', ['wiring', 'wire', 'spark', 'sparking', 'short circuit', 'shock', 'burning smell', 'तार', 'वायरिंग', 'चिंगारी', 'करंट', 'शॉर्ट', 'taar', 'chingari', 'karant', 'వైర్', 'వైరింగ్', 'స్పార్క్', 'షాక్', 'కరెంట్ షాక్']],
  ['switchboard', ['switch', 'socket', 'plug', 'board', 'mcb', 'fuse', 'स्विच', 'सॉकेट', 'प्लग', 'बोर्ड', 'फ्यूज', 'స్విచ్', 'సాకెట్', 'ప్లగ్', 'ఫ్యూజ్']],
  ['inverter', ['inverter', 'battery', 'ups', 'इन्वर्टर', 'बैटरी', 'ఇన్వర్టర్', 'బ్యాటరీ']],
  ['tap_leak', ['tap', 'leak', 'leaking', 'leakage', 'pipe', 'nal', 'nalka', 'tonti', 'नल', 'टोंटी', 'पाइप', 'रिसाव', 'टपक', 'पानी टपक', 'కుళాయి', 'పైపు', 'లీక్', 'నీళ్లు కారు', 'flush', 'toilet', 'basin', 'sink']],
  ['tank_overflow', ['tank', 'tanki', 'overflow', 'टंकी', 'ओवरफ्लो', 'ట్యాంక్', 'ట్యాంకు']],
  ['borewell', ['borewell', 'bore', 'tubewell', 'tube well', 'बोरवेल', 'बोर', 'ट्यूबवेल', 'బోరు', 'బోరుబావి', 'బోర్']],
  ['pump_dead', ['motor', 'pump', 'pumpset', 'starter', 'मोटर', 'पंप', 'स्टार्टर', 'మోటార్', 'మోటారు', 'పంపు', 'స్టార్టర్']],
  ['bulk_waste', ['garbage', 'trash', 'waste', 'rubbish', 'kachra', 'kooda', 'कचरा', 'कूड़ा', 'చెత్త', 'చెత్త కుప్ప']],
  ['mechanic', ['bike', 'scooter', 'scooty', 'motorcycle', 'cycle', 'tractor', 'puncture', 'tyre', 'engine', 'बाइक', 'स्कूटर', 'स्कूटी', 'ट्रैक्टर', 'पंचर', 'टायर', 'గాడి', 'బైక్', 'బండి', 'స్కూటర్', 'ట్రాక్టర్', 'పంక్చర్', 'టైర్']],
  ['carpentry', ['door', 'window', 'table', 'chair', 'cot', 'bed', 'cupboard', 'almirah', 'wood', 'hinge', 'lock', 'darwaza', 'khidki', 'दरवाज़ा', 'दरवाजा', 'खिड़की', 'कुर्सी', 'मेज़', 'पलंग', 'अलमारी', 'लकड़ी', 'ताला', 'తలుపు', 'కిటికీ', 'కుర్చీ', 'బల్ల', 'మంచం', 'బీరువా', 'చెక్క', 'తాళం']],
  ['mason', ['wall', 'plaster', 'paint', 'painting', 'crack', 'tiles', 'floor', 'दीवार', 'प्लास्टर', 'पुताई', 'रंगाई', 'दरार', 'टाइल', 'గోడ', 'పెయింట్', 'పెయింటింగ్', 'పగులు', 'టైల్స్']],
  ['farm', ['harvest', 'field work', 'labour', 'labor', 'mazdoor', 'ploughing', 'खेत', 'मज़दूर', 'मजदूर', 'कटाई', 'जुताई', 'పొలం', 'కూలీ', 'కోత', 'దున్నడం']],
  ['cleaning', ['cleaning', 'clean', 'tank cleaning', 'safai', 'jhadu', 'सफ़ाई', 'सफाई', 'झाड़ू', 'శుభ్రం', 'క్లీనింగ్', 'ఊడ్చడం']],
  ['appliance', ['mixer', 'grinder', 'tv', 'television', 'iron', 'washing machine', 'microwave', 'मिक्सर', 'टीवी', 'प्रेस', 'वाशिंग मशीन', 'మిక్సీ', 'టీవీ', 'ఇస్త్రీ', 'వాషింగ్ మెషిన్']],
  ['electrical', ['light', 'bulb', 'tubelight', 'bijli', 'electric', 'electrician', 'बिजली', 'लाइट', 'बल्ब', 'ट्यूबलाइट', 'కరెంట్', 'కరెంటు', 'లైట్', 'బల్బ్', 'ట్యూబ్‌లైట్']],
  ['plumbing', ['water', 'plumber', 'pani', 'पानी', 'प्लंबर', 'నీళ్లు', 'నీరు', 'ప్లంబర్']],
];

const LATIN = /^[a-z0-9 ]+$/;

/** Latin words must match whole words ("tap" is not in "laptop"); Indic scripts have no reliable word breaks after suffixes, so they match as substrings. */
function has(text: string, word: string): boolean {
  if (!LATIN.test(word)) return text.includes(word);
  return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`).test(text);
}

/**
 * Best catalog code for a transcript, or null if nothing recognisable was said.
 * Score = how many of a problem's words were heard, longer phrases counting more; ties go to the more specific problem.
 */
export function matchIntent(transcript: string): Intent | null {
  const text = transcript.toLowerCase().replace(/[.,!?।]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  let best: { code: string; matched: string[]; score: number } | null = null;
  for (const [code, words] of lexicon) {
    const matched = words.filter((w) => has(text, w.toLowerCase()));
    if (matched.length === 0) continue;
    // Sparks, shocks and burning smells outrank whatever else was mentioned: "sparks from the switchboard"
    // is a wiring fault with a safety card, not a switch replacement.
    const weight = code === 'wiring_fault' ? 3 : 1;
    const score = weight * matched.reduce((s, w) => s + 1 + w.split(' ').length * 0.5, 0);
    if (!best || score > best.score) best = { code, matched, score };
  }
  return best ? { code: best.code, matched: best.matched } : null;
}
