import type { ComponentProps } from 'react';
import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Lang } from '@/theme/type';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type Category = {
  code: string;
  parent: string | null;
  icon: IconName;
  name: Record<Lang, string>;
  /** Typical price range in rupees, shown before the customer ever calls. */
  price: [min: number, max: number];
  rail: 'worker' | 'civic';
};

/**
 * The service catalog, bundled so the picker works with no signal. Mirrors supabase/seed.sql.
 * A new service is a row here and a row there — never a new screen.
 * This file, the strings and the seed are the only region-specific parts of the app.
 */
export const catalog: Category[] = [
  { code: 'appliance', parent: null, icon: 'fan', name: { en: 'Fan and appliances', hi: 'पंखा और उपकरण', te: 'ఫ్యాన్, ఉపకరణాలు' }, price: [100, 800], rail: 'worker' },
  { code: 'electrical', parent: null, icon: 'lightning-bolt', name: { en: 'Electrical', hi: 'बिजली का काम', te: 'ఎలక్ట్రికల్' }, price: [100, 600], rail: 'worker' },
  { code: 'plumbing', parent: null, icon: 'faucet', name: { en: 'Plumbing', hi: 'नल और पाइप', te: 'ప్లంబింగ్' }, price: [100, 500], rail: 'worker' },
  { code: 'pump', parent: null, icon: 'water-pump', name: { en: 'Pump and tubewell', hi: 'मोटर और ट्यूबवेल', te: 'మోటార్, బోరుబావి' }, price: [300, 2000], rail: 'worker' },
  { code: 'mechanic', parent: null, icon: 'motorbike', name: { en: 'Bike and tractor repair', hi: 'बाइक और ट्रैक्टर मरम्मत', te: 'బైక్, ట్రాక్టర్ రిపేర్' }, price: [100, 800], rail: 'worker' },
  { code: 'carpentry', parent: null, icon: 'hand-saw', name: { en: 'Carpentry', hi: 'बढ़ई का काम', te: 'వడ్రంగి పని' }, price: [200, 1000], rail: 'worker' },
  { code: 'waste', parent: null, icon: 'trash-can-outline', name: { en: 'Garbage pickup', hi: 'कचरा उठाना', te: 'చెత్త తీసివేత' }, price: [100, 400], rail: 'worker' },
  { code: 'mason', parent: null, icon: 'wall', name: { en: 'Mason and painting', hi: 'राजमिस्त्री और पुताई', te: 'తాపీ, పెయింటింగ్' }, price: [500, 1200], rail: 'worker' },
  { code: 'farm', parent: null, icon: 'tractor', name: { en: 'Farm labour and tractor', hi: 'खेत मज़दूर और ट्रैक्टर', te: 'వ్యవసాయ కూలీ, ట్రాక్టర్' }, price: [400, 900], rail: 'worker' },
  { code: 'cleaning', parent: null, icon: 'broom', name: { en: 'Cleaning and tank cleaning', hi: 'सफ़ाई और टंकी सफ़ाई', te: 'శుభ్రత, ట్యాంక్ క్లీనింగ్' }, price: [200, 700], rail: 'worker' },

  { code: 'fan_dead', parent: 'appliance', icon: 'fan', name: { en: 'Fan not working', hi: 'पंखा नहीं चल रहा', te: 'ఫ్యాన్ పనిచేయడం లేదు' }, price: [150, 300], rail: 'worker' },
  { code: 'fan_noise', parent: 'appliance', icon: 'fan', name: { en: 'Fan slow or noisy', hi: 'पंखा धीमा या आवाज़', te: 'ఫ్యాన్ నెమ్మది / శబ్దం' }, price: [100, 250], rail: 'worker' },
  { code: 'geyser_install', parent: 'appliance', icon: 'water-boiler', name: { en: 'Geyser install or repair', hi: 'गीज़र लगाना / मरम्मत', te: 'గీజర్ బిగింపు / రిపేర్' }, price: [300, 600], rail: 'worker' },
  { code: 'cooler_fridge', parent: 'appliance', icon: 'fridge-outline', name: { en: 'Cooler or fridge repair', hi: 'कूलर / फ्रिज मरम्मत', te: 'కూలర్ / ఫ్రిజ్ రిపేర్' }, price: [250, 800], rail: 'worker' },
  { code: 'wiring_fault', parent: 'electrical', icon: 'lightning-bolt', name: { en: 'Wiring fault or sparking', hi: 'वायरिंग खराबी / चिंगारी', te: 'వైరింగ్ లోపం / స్పార్క్' }, price: [200, 600], rail: 'worker' },
  { code: 'switchboard', parent: 'electrical', icon: 'light-switch', name: { en: 'Switch or socket', hi: 'स्विच / सॉकेट', te: 'స్విచ్ / సాకెట్' }, price: [80, 200], rail: 'worker' },
  { code: 'inverter', parent: 'electrical', icon: 'car-battery', name: { en: 'Inverter or battery', hi: 'इन्वर्टर / बैटरी', te: 'ఇన్వర్టర్ / బ్యాటరీ' }, price: [250, 700], rail: 'worker' },
  { code: 'tap_leak', parent: 'plumbing', icon: 'pipe-leak', name: { en: 'Tap or pipe leaking', hi: 'नल / पाइप से रिसाव', te: 'కుళాయి / పైపు లీక్' }, price: [100, 300], rail: 'worker' },
  { code: 'tank_overflow', parent: 'plumbing', icon: 'storage-tank-outline', name: { en: 'Tank or motor line', hi: 'टंकी / मोटर लाइन', te: 'ట్యాంక్ / మోటార్ లైన్' }, price: [200, 500], rail: 'worker' },
  { code: 'pump_dead', parent: 'pump', icon: 'water-pump', name: { en: 'Motor not starting', hi: 'मोटर चालू नहीं हो रही', te: 'మోటార్ స్టార్ట్ కావడం లేదు' }, price: [300, 900], rail: 'worker' },
  { code: 'borewell', parent: 'pump', icon: 'water-pump', name: { en: 'Borewell or tubewell', hi: 'बोरवेल / ट्यूबवेल', te: 'బోరుబావి' }, price: [500, 2000], rail: 'worker' },
  { code: 'bulk_waste', parent: 'waste', icon: 'trash-can-outline', name: { en: 'Bulk waste pickup', hi: 'ज़्यादा कचरा उठाना', te: 'ఎక్కువ చెత్త తీసివేత' }, price: [100, 400], rail: 'worker' },
];

export const topLevel = catalog.filter((c) => c.parent === null);
export const childrenOf = (code: string) => catalog.filter((c) => c.parent === code);
export const byCode = (code: string) => catalog.find((c) => c.code === code);

/** Speech locale for reading a label aloud to someone who cannot read it. */
export const speechLocale: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' };
