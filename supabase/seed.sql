-- Demo data. Workers are scattered within ~6 km of DEMO_LAT/DEMO_LNG (Hyderabad, HITEC City by default).
-- Change the two numbers in the `centre` CTE to the venue before the demo.

insert into categories (code, parent_code, icon, name_en, name_hi, name_te, vision_class, rail, sort) values
 ('electrical', null, 'bolt',     'Electrical',            'बिजली का काम',        'ఎలక్ట్రికల్',          'WIRING_SWITCH',  'worker', 1),
 ('plumbing',   null, 'tap',      'Plumbing',              'नल और पाइप',          'ప్లంబింగ్',            'TAP_PIPE_LEAK',  'worker', 2),
 ('pump',       null, 'pump',     'Pump and tubewell',     'मोटर और ट्यूबवेल',     'మోటార్, బోరుబావి',     'PUMP_MOTOR',     'worker', 3),
 ('appliance',  null, 'fan',      'Fan and appliances',    'पंखा और उपकरण',        'ఫ్యాన్, ఉపకరణాలు',      'FAN_APPLIANCE',  'worker', 4),
 ('carpentry',  null, 'saw',      'Carpentry',             'बढ़ई का काम',          'వడ్రంగి పని',          'WOOD_FURNITURE_DOOR', 'worker', 5),
 ('mechanic',   null, 'wrench',   'Bike and tractor repair','बाइक और ट्रैक्टर मरम्मत','బైక్, ట్రాక్టర్ రిపేర్', 'VEHICLE',        'worker', 6),
 ('waste',      null, 'bin',      'Garbage pickup',        'कचरा उठाना',           'చెత్త తీసివేత',         'GARBAGE',        'worker', 7),
 ('mason',      null, 'trowel',   'Mason and painting',    'राजमिस्त्री और पुताई',  'తాపీ, పెయింటింగ్',      null,             'worker', 8),
 ('farm',       null, 'tractor',  'Farm labour and tractor','खेत मज़दूर और ट्रैक्टर', 'వ్యవసాయ కూలీ, ట్రాక్టర్', null,            'worker', 9),
 ('cleaning',   null, 'broom',    'Cleaning and tank cleaning','सफ़ाई और टंकी सफ़ाई', 'శుభ్రత, ట్యాంక్ క్లీనింగ్', null,          'worker', 10),
 ('civic',      null, 'stamp',    'Report to panchayat',   'पंचायत को बताएँ',      'పంచాయతీకి తెలపండి',     'CIVIC_ROAD_DRAIN_LIGHT', 'civic', 99),

 ('fan_dead',        'appliance', 'fan',   'Fan not working',        'पंखा नहीं चल रहा',     'ఫ్యాన్ పనిచేయడం లేదు',   null, 'worker', 1),
 ('fan_noise',       'appliance', 'fan',   'Fan slow or noisy',      'पंखा धीमा या आवाज़',    'ఫ్యాన్ నెమ్మది / శబ్దం', null, 'worker', 2),
 ('geyser_install',  'appliance', 'geyser','Geyser install or repair','गीज़र लगाना / मरम्मत',  'గీజర్ బిగింపు / రిపేర్', null, 'worker', 3),
 ('cooler_fridge',   'appliance', 'fridge','Cooler or fridge repair','कूलर / फ्रिज मरम्मत',   'కూలర్ / ఫ్రిజ్ రిపేర్',  null, 'worker', 4),
 ('wiring_fault',    'electrical','bolt',  'Wiring fault or sparking','वायरिंग खराबी / चिंगारी','వైరింగ్ లోపం / స్పార్క్', null, 'worker', 1),
 ('switchboard',     'electrical','switch','Switch or socket',       'स्विच / सॉकेट',         'స్విచ్ / సాకెట్',        null, 'worker', 2),
 ('inverter',        'electrical','battery','Inverter or battery',   'इन्वर्टर / बैटरी',       'ఇన్వర్టర్ / బ్యాటరీ',    null, 'worker', 3),
 ('tap_leak',        'plumbing',  'tap',   'Tap or pipe leaking',    'नल / पाइप से रिसाव',     'కుళాయి / పైపు లీక్',     null, 'worker', 1),
 ('tank_overflow',   'plumbing',  'tank',  'Tank or motor line',     'टंकी / मोटर लाइन',       'ట్యాంక్ / మోటార్ లైన్',  null, 'worker', 2),
 ('pump_dead',       'pump',      'pump',  'Motor not starting',     'मोटर चालू नहीं हो रही',  'మోటార్ స్టార్ట్ కావడం లేదు', null, 'worker', 1),
 ('borewell',        'pump',      'pump',  'Borewell or tubewell',   'बोरवेल / ट्यूबवेल',      'బోరుబావి',               null, 'worker', 2),
 ('bulk_waste',      'waste',     'bin',   'Bulk waste pickup',      'ज़्यादा कचरा उठाना',     'ఎక్కువ చెత్త తీసివేత',   null, 'worker', 1);

insert into rate_cards (category_code, min_inr, max_inr) values
 ('fan_dead',150,300), ('fan_noise',100,250), ('geyser_install',300,600), ('cooler_fridge',250,800),
 ('wiring_fault',200,600), ('switchboard',80,200), ('inverter',250,700),
 ('tap_leak',100,300), ('tank_overflow',200,500), ('pump_dead',300,900), ('borewell',500,2000),
 ('bulk_waste',100,400),
 ('electrical',100,600), ('plumbing',100,500), ('pump',300,2000), ('appliance',100,800),
 ('carpentry',200,1000), ('mechanic',100,800), ('waste',100,400), ('mason',500,1200),
 ('farm',400,900), ('cleaning',200,700);

with centre as (select 17.4474::double precision as lat, 78.3762::double precision as lng),
people(name, phone, lang, village, skills, languages, verified, rating, n_ratings, jobs, tier, dlat, dlng) as (values
 ('Ramesh Goud',      '+919000000001','te','Madhapur',   '{electrical,appliance}', '{te,hi}',    true,  4.8, 61, 64, 'star',    0.004,  0.006),
 ('Salim Pasha',      '+919000000002','hi','Kondapur',   '{electrical,pump}',      '{hi,te}',    true,  4.5, 22, 25, 'trusted', -0.012, 0.009),
 ('Venkatesh Rao',    '+919000000003','te','Gachibowli', '{plumbing,pump}',        '{te}',       true,  4.6, 34, 40, 'star',    0.015, -0.011),
 ('Lakshmi Devi',     '+919000000004','te','Miyapur',    '{cleaning,waste}',       '{te,hi}',    true,  4.7, 18, 19, 'trusted', -0.021, -0.014),
 ('Imran Khan',       '+919000000005','hi','Madhapur',   '{mechanic}',             '{hi,te,en}', false, 4.1,  6,  7, 'trusted', 0.007, -0.004),
 ('Narsimha Chary',   '+919000000006','te','Kukatpally', '{carpentry}',            '{te}',       true,  4.9, 45, 52, 'star',    0.028,  0.019),
 ('Suresh Yadav',     '+919000000007','hi','Kondapur',   '{appliance}',            '{hi}',       false, 0.0,  0,  0, 'new',     -0.006, 0.013),
 ('Anjaiah M',        '+919000000008','te','Lingampally','{farm,pump}',            '{te}',       false, 4.2,  9, 11, 'trusted', -0.034, 0.027),
 ('Yadagiri K',       '+919000000009','te','Gachibowli', '{waste}',                '{te,hi}',    true,  4.4, 27, 30, 'trusted', 0.011,  0.002),
 ('Mahesh Babu P',    '+919000000010','te','Madhapur',   '{mason}',                '{te}',       false, 3.9, 12, 14, 'new',     0.002, -0.009),
 ('Abdul Rahim',      '+919000000011','hi','Hafeezpet',  '{plumbing,electrical}',  '{hi,te}',    true,  4.6, 38, 41, 'star',    -0.017, 0.004),
 ('Srinivas Reddy',   '+919000000012','te','Kondapur',   '{electrical}',           '{te,en}',    false, 4.0,  4,  4, 'new',     0.019, -0.016)
),
ins as (
  insert into profiles (role, name, phone, lang, village)
  select 'worker', name, phone, lang, village from people
  returning id, phone
)
insert into workers (profile_id, skills, languages, on_duty, last_seen, geog, upi_id, verified, rating_avg, rating_count, jobs_done, tier)
select ins.id, p.skills::text[], p.languages::text[], true,
       now() + interval '30 days',   -- seeded workers stay "present" for the whole event
       st_makepoint(c.lng + p.dlng, c.lat + p.dlat)::geography,
       'demo@upi', p.verified, p.rating, p.n_ratings, p.jobs, p.tier
from people p join ins on ins.phone = p.phone cross join centre c;
