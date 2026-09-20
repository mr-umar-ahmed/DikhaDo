/**
 * UI strings. Every key exists in every language; the `Strings` type enforces it.
 * A new language is one more object here plus a font choice in theme/type.ts.
 */
const en = {
  tagline: 'Just show it. It gets fixed.',
  chooseLanguage: 'Choose your language',
  whoAreYou: 'How will you use DikhaDo?',
  roleCustomer: 'I need something fixed',
  roleCustomerHint: 'Show the problem, find a worker nearby',
  roleWorker: 'I am a worker',
  roleWorkerHint: 'Get jobs near you, build your name',
  roleSahayak: 'I help others book',
  roleSahayakHint: 'For CSC operators and village helpers',
  customerHomeTitle: 'What is broken?',
  customerHomeBody: 'The camera and the problem picker arrive in the next build.',
  workerHomeTitle: 'Your jobs',
  workerHomeBody: 'Go on duty and receive jobs in the next build.',
  sahayakHomeTitle: 'Book for someone',
  sahayakHomeBody: 'Assisted booking arrives after the core flow.',
  changeRole: 'Change how you use the app',
  worksOnWeakSignal: 'Works on weak signal',
};

export type Strings = typeof en;

const hi: Strings = {
  tagline: 'दिखा दो। ठीक हो जाएगा।',
  chooseLanguage: 'अपनी भाषा चुनें',
  whoAreYou: 'आप DikhaDo का इस्तेमाल कैसे करेंगे?',
  roleCustomer: 'मुझे कुछ ठीक करवाना है',
  roleCustomerHint: 'खराबी दिखाइए, पास का कारीगर पाइए',
  roleWorker: 'मैं कारीगर हूँ',
  roleWorkerHint: 'पास के काम पाइए, अपना नाम बनाइए',
  roleSahayak: 'मैं दूसरों की बुकिंग में मदद करता हूँ',
  roleSahayakHint: 'CSC संचालक और गाँव के सहायक के लिए',
  customerHomeTitle: 'क्या खराब है?',
  customerHomeBody: 'कैमरा और समस्या चुनने की सुविधा अगले बिल्ड में आएगी।',
  workerHomeTitle: 'आपके काम',
  workerHomeBody: 'ड्यूटी पर जाने और काम पाने की सुविधा अगले बिल्ड में आएगी।',
  sahayakHomeTitle: 'किसी के लिए बुक करें',
  sahayakHomeBody: 'सहायक बुकिंग मुख्य सुविधा के बाद आएगी।',
  changeRole: 'ऐप इस्तेमाल करने का तरीका बदलें',
  worksOnWeakSignal: 'कमज़ोर नेटवर्क पर भी चलता है',
};

const te: Strings = {
  tagline: 'చూపించండి. బాగైపోతుంది.',
  chooseLanguage: 'మీ భాషను ఎంచుకోండి',
  whoAreYou: 'మీరు DikhaDo ను ఎలా వాడతారు?',
  roleCustomer: 'నాకు ఏదో బాగు చేయించాలి',
  roleCustomerHint: 'సమస్య చూపించండి, దగ్గర్లోని పనివారిని పొందండి',
  roleWorker: 'నేను పనివాడిని',
  roleWorkerHint: 'దగ్గర్లో పనులు పొందండి, మంచి పేరు తెచ్చుకోండి',
  roleSahayak: 'నేను ఇతరులకు బుకింగ్‌లో సహాయం చేస్తాను',
  roleSahayakHint: 'CSC నిర్వాహకులు, గ్రామ సహాయకుల కోసం',
  customerHomeTitle: 'ఏది పాడైంది?',
  customerHomeBody: 'కెమెరా, సమస్య ఎంపిక తదుపరి బిల్డ్‌లో వస్తాయి.',
  workerHomeTitle: 'మీ పనులు',
  workerHomeBody: 'డ్యూటీలోకి వెళ్లి పనులు పొందడం తదుపరి బిల్డ్‌లో వస్తుంది.',
  sahayakHomeTitle: 'ఇతరుల కోసం బుక్ చేయండి',
  sahayakHomeBody: 'సహాయక బుకింగ్ ప్రధాన సదుపాయం తర్వాత వస్తుంది.',
  changeRole: 'యాప్ వాడే విధానాన్ని మార్చండి',
  worksOnWeakSignal: 'బలహీన సిగ్నల్‌లోనూ పనిచేస్తుంది',
};

export const resources = {
  en: { translation: en },
  hi: { translation: hi },
  te: { translation: te },
};

/** Shown in the language's own script, so a user who reads only that script can find it. */
export const languageNames = { en: 'English', hi: 'हिन्दी', te: 'తెలుగు' } as const;
