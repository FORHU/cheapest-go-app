/**
 * Smoke tests for CITY_ALIASES — structure integrity + spot-checks for recently
 * added country blocks. Not exhaustive: just enough to catch duplicate keys,
 * null/undefined values, and misrouted aliases introduced during bulk edits.
 */

import { describe, it, expect } from 'vitest';
import { CITY_ALIASES } from '@/lib/constants/cityAliases';

// ── structural invariants ─────────────────────────────────────────────────────

describe('CITY_ALIASES structure', () => {
    it('exports a non-empty object', () => {
        expect(CITY_ALIASES).toBeDefined();
        expect(typeof CITY_ALIASES).toBe('object');
        expect(Object.keys(CITY_ALIASES).length).toBeGreaterThan(0);
    });

    it('all country codes are 2-letter uppercase strings', () => {
        for (const code of Object.keys(CITY_ALIASES)) {
            expect(code).toMatch(/^[A-Z]{2}$/, `Bad country code: "${code}"`);
        }
    });

    it('all alias values are non-empty strings', () => {
        for (const [cc, map] of Object.entries(CITY_ALIASES)) {
            for (const [alias, city] of Object.entries(map)) {
                expect(typeof city).toBe('string', `${cc}["${alias}"] value is not a string`);
                expect(city.length).toBeGreaterThan(0, `${cc}["${alias}"] value is empty`);
            }
        }
    });

    it('no alias key is empty', () => {
        for (const [cc, map] of Object.entries(CITY_ALIASES)) {
            for (const alias of Object.keys(map)) {
                expect(alias.length).toBeGreaterThan(0, `Empty key in ${cc}`);
            }
        }
    });

    // TypeScript catches duplicate keys at compile time, but this catches any
    // runtime map that somehow collapses silently (shouldn't happen, but cheap).
    it('covers all expected country codes added this session', () => {
        const expected = [
            'AF','AM','AZ','BH','BD','BT','BN','KH','CY',  // latest batch
            'IN','IR','IQ','JO','KZ','KW','KG','MY','MV',  // earlier batches
            'MN','MM','LA','LB','NP','OM','PK','QA','RU',
            'SA','SG','LK','PS','SY','TJ','TH','TM','TR',
            'AE','UZ','VN',
        ];
        for (const cc of expected) {
            expect(CITY_ALIASES[cc]).toBeDefined(`Missing country block: ${cc}`);
            expect(Object.keys(CITY_ALIASES[cc]).length).toBeGreaterThan(0, `Empty block: ${cc}`);
        }
    });
});

// ── spot-checks: recently added countries ─────────────────────────────────────

describe('AF (Afghanistan) aliases', () => {
    const m = CITY_ALIASES['AF'];
    it('resolves Kabul neighborhoods', () => {
        expect(m['wazir akbar khan']).toBe('Kabul');
        expect(m['dasht-e-barchi']).toBe('Kabul');
    });
    it('resolves Dari script name for Kabul', () => {
        expect(m['کابل']).toBe('Kabul');
    });
    it('resolves Herat', () => {
        expect(m['herat city']).toBe('Herat');
        expect(m['هرات']).toBe('Herat');
    });
    it('resolves Bamyan UNESCO site', () => {
        expect(m['band-i-amir lake']).toBe('Bamyan');
        expect(m['bamiyan valley']).toBe('Bamyan');
    });
});

describe('AM (Armenia) aliases', () => {
    const m = CITY_ALIASES['AM'];
    it('resolves Yerevan districts to TGX canonical Jerewan', () => {
        expect(m['kentron yerevan']).toBe('Jerewan');
        expect(m['cascade yerevan']).toBe('Jerewan');
        expect(m['yerevan']).toBe('Jerewan');
    });
    it('resolves Gyumri to TGX canonical Gjumri', () => {
        expect(m['gyumri city']).toBe('Gjumri');
        expect(m['gyumri downtown']).toBe('Gjumri');
    });
    it('resolves Dilijan to TGX canonical Dilidschan', () => {
        expect(m['dilijan']).toBe('Dilidschan');
        expect(m['haghartsin monastery']).toBe('Dilidschan');
    });
    it('resolves Echmiadzin to TGX canonical Etschmiadsin', () => {
        expect(m['echmiadzin']).toBe('Etschmiadsin');
        expect(m['vagharshapat']).toBe('Etschmiadsin');
    });
    it('resolves newly added DB cities', () => {
        expect(m['tsaghkadzor']).toBe('Zaghkadsor');
        expect(m['ijevan']).toBe('Idschewan');
        expect(m['parakar']).toBe('Jerewan');
    });
    it('resolves Armenian script names to TGX canonicals', () => {
        expect(m['Երևան']).toBe('Jerewan');
        expect(m['Գյումրի']).toBe('Gjumri');
        expect(m['Դիլիջան']).toBe('Dilidschan');
    });
    it('resolves Tatev ropeway to Goris', () => {
        expect(m['wings of tatev']).toBe('Goris');
        expect(m['tatev ropeway']).toBe('Goris');
    });
});

describe('AZ (Azerbaijan) aliases', () => {
    const m = CITY_ALIASES['AZ'];
    it('resolves Baku districts and sites', () => {
        expect(m['icherisheher']).toBe('Baku');
        expect(m['gobustan national park']).toBe('Baku');
        expect(m['ateshgah fire temple']).toBe('Baku');
    });
    it('resolves TGX canonical spellings', () => {
        expect(m['sheki city']).toBe('Şəki');
        expect(m['lankaran city']).toBe('Lənkəran');
        expect(m['sumgayit']).toBe('Sumqayit');
        expect(m['mingachevir']).toBe('Mingecevir');
        expect(m['ismayilli']).toBe('Ismailli');
        expect(m['shusha']).toBe('Schuschi');
        expect(m['qusar ski']).toBe('Kussary');
        expect(m['naftalan']).toBe('Naftalan');
    });
    it('resolves Azerbaijani script names', () => {
        expect(m['Bakı']).toBe('Baku');
        expect(m['Gəncə']).toBe('Ganja');
        expect(m['Şəki']).toBe('Şəki');
        expect(m['Lənkəran']).toBe('Lənkəran');
        expect(m['Sumqayıt']).toBe('Sumqayit');
    });
});

describe('BH (Bahrain) aliases', () => {
    const m = CITY_ALIASES['BH'];
    it('resolves Manama districts', () => {
        expect(m['seef']).toBe('Manama');
        expect(m['juffair']).toBe('Manama');
    });
    it('resolves landmarks', () => {
        expect(m['bahrain fort']).toBe('Manama');
        expect(m['hawar islands']).toBe('Hawar');
    });
    it('resolves Arabic script names', () => {
        expect(m['المنامة']).toBe('Manama');
        expect(m['البحرين']).toBe('Manama');
    });
});

describe('BD (Bangladesh) aliases', () => {
    const m = CITY_ALIASES['BD'];
    it('resolves Dhaka neighborhoods', () => {
        expect(m['gulshan']).toBe('Gulshan'); // TGX lists Gulshan as its own city
        expect(m['bashundhara']).toBe('Dhaka');
    });
    it('resolves Cox\'s Bazar extras', () => {
        expect(m['st martins island']).toBe("Cox's Bazar");
        expect(m['teknaf']).toBe("Cox's Bazar");
    });
    it('resolves Sylhet extras', () => {
        expect(m['srimangal']).toBe('Sylhet');
        expect(m['jaflong']).toBe('Sylhet');
    });
    it('resolves Bengali script names', () => {
        expect(m['ঢাকা']).toBe('Dhaka');
        expect(m['চট্টগ্রাম']).toBe('Chittagong');
        expect(m['সিলেট']).toBe('Sylhet');
    });
});

describe('BT (Bhutan) aliases', () => {
    const m = CITY_ALIASES['BT'];
    it('resolves Paro monasteries', () => {
        expect(m['taktsang monastery']).toBe('Paro');
        expect(m['rinpung dzong']).toBe('Paro');
    });
    it('resolves Phuentsholing to TGX canonical Phuntsholing', () => {
        expect(m['phuentsholing']).toBe('Phuntsholing');
        expect(m['phuentsholing city']).toBe('Phuntsholing');
    });
    it('resolves treks to Thimphu', () => {
        expect(m['snowman trek']).toBe('Thimphu');
    });
});

describe('BN (Brunei) aliases', () => {
    const m = CITY_ALIASES['BN'];
    it('resolves BSB landmarks', () => {
        expect(m['kampong ayer']).toBe('Bandar Seri Begawan');
        expect(m['omar ali saifuddien mosque']).toBe('Bandar Seri Begawan');
    });
    it('resolves Temburong national park', () => {
        expect(m['ulu temburong national park']).toBe('Temburong');
        expect(m['belalong canopy walkway']).toBe('Temburong');
    });
    it('resolves Jerudong (7 hotels — was missing)', () => {
        expect(m['jerudong']).toBe('Jerudong');
        expect(m['empire hotel brunei']).toBe('Jerudong');
    });
    it('resolves BSB district aliases', () => {
        expect(m['kiarong']).toBe('Bandar Seri Begawan');
        expect(m['rimba']).toBe('Bandar Seri Begawan');
    });
});

describe('KH (Cambodia) aliases', () => {
    const m = CITY_ALIASES['KH'];
    it('resolves Phnom Penh areas', () => {
        expect(m['bkk1']).toBe('Phnom Penh');
        expect(m['tuol sleng']).toBe('Phnom Penh');
    });
    it('resolves Siem Reap / Angkor sites', () => {
        expect(m['pub street']).toBe('Siem Reap');
        expect(m['ta prohm']).toBe('Siem Reap');
        expect(m['beng mealea']).toBe('Siem Reap');
        expect(m['phnom bakheng']).toBe('Siem Reap');
    });
    it('resolves TGX canonical spellings', () => {
        expect(m['koh rong samloem']).toBe('Koh Rong Sanloem');
        expect(m['kampong thom']).toBe('Kampong Thum');
        expect(m['ban lung']).toBe('Banlung');
        expect(m['tatai']).toBe('Tatai');
    });
    it('resolves new province entries', () => {
        expect(m['kampong cham']).toBe('Kampong Cham');
        expect(m['poipet']).toBe('Poipet');
    });
    it('resolves Khmer script names', () => {
        expect(m['ភ្នំពេញ']).toBe('Phnom Penh');
        expect(m['សៀមរាប']).toBe('Siem Reap');
        expect(m['ព្រះសីហនុ']).toBe('Sihanoukville');
    });
});

describe('CY (Cyprus) aliases', () => {
    const m = CITY_ALIASES['CY'];
    it('resolves Limassol correctly', () => {
        expect(m['limassol marina']).toBe('Limassol');
        expect(m['ayia napa beach']).toBe('Ayia Napa');
        expect(m['fig tree bay']).toBe('Protaras');
    });
    it('resolves Nicosia to TGX canonical Nikosia', () => {
        expect(m['old nicosia']).toBe('Nikosia');
        expect(m['nicosia']).toBe('Nikosia');
        expect(m['ledra street']).toBe('Nikosia');
    });
    it('resolves Larnaca to TGX canonical Larnaka', () => {
        expect(m['larnaca city']).toBe('Larnaka');
        expect(m['larnaca']).toBe('Larnaka');
        expect(m['finikoudes']).toBe('Larnaka');
    });
    it('resolves Polis Chrysochous to TGX canonical Poli Crysochous', () => {
        expect(m['polis chrysochous']).toBe('Poli Crysochous');
    });
    it('resolves Paralimni (711 hotels — was missing)', () => {
        expect(m['paralimni']).toBe('Paralimni');
    });
    it('resolves cities that TGX lists separately', () => {
        expect(m['germasogeia']).toBe('Germasogeia');
        expect(m['agios tychonas']).toBe('Agios Tychonas');
        expect(m['strovolos']).toBe('Strovolos');
        expect(m['peyia']).toBe('Peyia');
        expect(m['chloraka']).toBe('Chlorakas');
        expect(m['kouklia']).toBe('Kouklia');
        expect(m['pissouri']).toBe('Pissouri');
        expect(m['kakopetria']).toBe('Kakopetria');
        expect(m['lefkara village']).toBe('Lefkara');
    });
    it('resolves North Cyprus to TGX canonical Girne', () => {
        expect(m['kyrenia']).toBe('Girne');
        expect(m['girne']).toBe('Girne');
        expect(m['bellapais abbey']).toBe('Girne');
        expect(m['famagusta']).toBe('Famagusta');
        expect(m['north nicosia']).toBe('North Nicosia');
    });
    it('resolves Troodos villages', () => {
        expect(m['platres']).toBe('Platres');
        expect(m['kykkos monastery']).toBe('Troodos');
    });
    it('resolves Greek/Turkish script names to TGX canonicals', () => {
        expect(m['Λευκωσία']).toBe('Nikosia');
        expect(m['Λεμεσός']).toBe('Limassol');
        expect(m['Πάφος']).toBe('Paphos');
        expect(m['Λάρνακα']).toBe('Larnaka');
        expect(m['Lefkoşa']).toBe('Nikosia');
        expect(m['Κύπρος']).toBe('Nikosia');
    });
});

// ── regression: earlier-session countries ─────────────────────────────────────

describe('VN (Vietnam) aliases', () => {
    const m = CITY_ALIASES['VN'];
    it('resolves HCMC aliases to TGX canonical Ho-Chi-Minh-Stadt (1973 hotels)', () => {
        expect(m['saigon']).toBe('Ho-Chi-Minh-Stadt');
        expect(m['district 1']).toBe('Ho-Chi-Minh-Stadt');
        expect(m['ben thanh']).toBe('Ho-Chi-Minh-Stadt');
        expect(m['hcmc']).toBe('Ho-Chi-Minh-Stadt');
    });
    it('resolves Vietnamese diacritic names', () => {
        expect(m['hà nội']).toBe('Hanoi');
        expect(m['đà nẵng']).toBe('Da Nang');
        expect(m['huế']).toBe('Hue');
        expect(m['đà lạt']).toBe('Ðà Lat');
        expect(m['hạ long']).toBe('Ha Long');
    });
    it('resolves Sapa village extras', () => {
        expect(m['cat cat village']).toBe('Sapa');
        expect(m['fansipan']).toBe('Sapa');
    });
    it('resolves Hoi An extras', () => {
        expect(m['tra que village']).toBe('Hoi An');
    });
    it('resolves TGX diacritic canonicals', () => {
        expect(m['vung tau city']).toBe('Vung Tàu');
        expect(m['front beach vung tau']).toBe('Vung Tàu');
        expect(m['ninh kieu']).toBe('Cân Tho');
        expect(m['quy nhon']).toBe('Quy Nhơn');
        expect(m['my tho']).toBe('Mỹ Tho');
        expect(m['dien bien phu']).toBe('Dien-Bien-Phu');
        expect(m['dalat city']).toBe('Ðà Lat');
    });
    it('resolves Ninh Binh area to TGX canonical Hoa Lu (302 hotels)', () => {
        expect(m['ninh binh']).toBe('Hoa Lu');
        expect(m['tam coc']).toBe('Hoa Lu');
        expect(m['trang an']).toBe('Hoa Lu');
    });
    it('resolves Phong Nha as separate TGX city (62 hotels)', () => {
        expect(m['phong nha']).toBe('Phong Nha');
        expect(m['son doong']).toBe('Phong Nha');
    });
    it('resolves Haiphong (one word) as TGX canonical', () => {
        expect(m['hai phong']).toBe('Haiphong');
    });
    it('resolves Con Son as TGX canonical (79 hotels)', () => {
        expect(m['con son']).toBe('Con Son');
        expect(m['con dao']).toBe('Con Son');
    });
});

describe('UZ (Uzbekistan) aliases', () => {
    const m = CITY_ALIASES['UZ'];
    it('resolves Silk Road extras', () => {
        expect(m['gijduvan']).toBe('Bukhara');
        expect(m['varakhsha']).toBe('Bukhara');
        expect(m['ak saray']).toBe('Shakhrisabz');
    });
    it('resolves Uzbek script names to TGX canonicals', () => {
        expect(m['Toshkent']).toBe('Taschkent');
        expect(m['Samarqand']).toBe('Samarkand');
        expect(m['Buxoro']).toBe('Bukhara');
        expect(m['Xiva']).toBe('Khiva');
    });
    it('resolves Tashkent aliases to TGX Taschkent', () => {
        expect(m['tashkent city']).toBe('Taschkent');
        expect(m['yunusabad']).toBe('Taschkent');
    });
    it('resolves Shahrisabz to TGX Shakhrisabz', () => {
        expect(m['shahrisabz']).toBe('Shakhrisabz');
        expect(m['shakhrisabz old town']).toBe('Shakhrisabz');
    });
});

describe('TR (Turkey) aliases', () => {
    const m = CITY_ALIASES['TR'];
    it('resolves Turkish language names', () => {
        expect(m['türkiye']).toBe('Istanbul');
        expect(m['İstanbul']).toBe('Istanbul');
    });
});

describe('TH (Thailand) aliases', () => {
    const m = CITY_ALIASES['TH'];
    it('resolves Thai script names', () => {
        expect(m['กรุงเทพ']).toBe('Bangkok');
        expect(m['เชียงใหม่']).toBe('Chiang Mai');
        expect(m['ภูเก็ต']).toBe('Phuket Stadt');
    });
});

describe('SA (Saudi Arabia) aliases', () => {
    const m = CITY_ALIASES['SA'];
    it('resolves Arabic script names to TGX German canonicals', () => {
        expect(m['الرياض']).toBe('Riad');
        expect(m['جدة']).toBe('Djiddah');
        expect(m['مكة المكرمة']).toBe('Mekka');
    });
    it('resolves Riyadh, Jeddah, Mecca to TGX German names', () => {
        expect(m['riyadh park']).toBe('Riad');
        expect(m['corniche jeddah']).toBe('Djiddah');
        expect(m['mecca holy city']).toBe('Mekka');
    });
});

describe('KZ (Kazakhstan) aliases', () => {
    const m = CITY_ALIASES['KZ'];
    it('resolves German transliterations', () => {
        expect(m['shymkent']).toBe('Schymkent');
        expect(m['aktobe city']).toBe('Aktöbe');
        expect(m['pavlodar city']).toBe('Pawlodar');
        expect(m['kokshetau']).toBe('Kökschetau');
        expect(m['shchuchinsk']).toBe('Schtschutschinsk');
        expect(m['taraz city']).toBe('Dzambul');
        expect(m['turkistan city']).toBe('Türkistan');
    });
    it('resolves Kazakh script names', () => {
        expect(m['Шымкент']).toBe('Schymkent');
        expect(m['Тараз']).toBe('Dzambul');
        expect(m['Павлодар']).toBe('Pawlodar');
        expect(m['Ақтөбе']).toBe('Aktöbe');
    });
});

describe('KW (Kuwait) aliases', () => {
    const m = CITY_ALIASES['KW'];
    it('resolves Kuwait City to TGX Kuwait-Stadt', () => {
        expect(m['kuwait city centre']).toBe('Kuwait-Stadt');
    });
    it('resolves suburbs as separate TGX cities', () => {
        expect(m['salmiya']).toBe('Salmiyah');
        expect(m['hawally']).toBe('Hawally');
        expect(m['fahaheel']).toBe('Fahaheel');
        expect(m['fintas']).toBe('Fintas');
        expect(m['mangaf']).toBe('Mangaf');
    });
    it('resolves Arabic script names', () => {
        expect(m['السالمية']).toBe('Salmiyah');
        expect(m['حولي']).toBe('Hawally');
        expect(m['الفحيحيل']).toBe('Fahaheel');
    });
});

describe('KG (Kyrgyzstan) aliases', () => {
    const m = CITY_ALIASES['KG'];
    it('resolves Bishkek to TGX Bischkek', () => {
        expect(m['bishkek city']).toBe('Bischkek');
        expect(m['Бишкек']).toBe('Bischkek');
    });
    it('resolves Osh to TGX Osch', () => {
        expect(m['osh city']).toBe('Osch');
        expect(m['Ош']).toBe('Osch');
    });
    it('resolves Issyk-Kul to TGX Tscholpon-Ata', () => {
        expect(m['issyk-kul']).toBe('Tscholpon-Ata');
        expect(m['cholpon ata']).toBe('Tscholpon-Ata');
    });
});

describe('TJ (Tajikistan) aliases', () => {
    const m = CITY_ALIASES['TJ'];
    it('resolves Dushanbe to TGX Duschanbe', () => {
        expect(m['dushanbe city']).toBe('Duschanbe');
        expect(m['Душанбе']).toBe('Duschanbe');
    });
    it('resolves Khujand to TGX Chudshand', () => {
        expect(m['khujand city']).toBe('Chudshand');
        expect(m['Худжанд']).toBe('Chudshand');
    });
});

describe('TM (Turkmenistan) aliases', () => {
    const m = CITY_ALIASES['TM'];
    it('resolves Turkmenabat to TGX Tschardshou', () => {
        expect(m['turkmenabat']).toBe('Tschardshou');
        expect(m['turkmenabat city']).toBe('Tschardshou');
    });
    it('resolves Turkmenbashi to TGX Krasnowodsk', () => {
        expect(m['turkmenbashi']).toBe('Krasnowodsk');
        expect(m['avaza beach']).toBe('Krasnowodsk');
    });
});

describe('NP (Nepal) aliases', () => {
    const m = CITY_ALIASES['NP'];
    it('resolves Kathmandu to TGX Katmandu', () => {
        expect(m['thamel']).toBe('Katmandu');
        expect(m['boudhanath']).toBe('Katmandu');
        expect(m['kathmandu city']).toBe('Katmandu');
    });
});

describe('JO (Jordan) aliases', () => {
    const m = CITY_ALIASES['JO'];
    it('resolves Aqaba to TGX Akaba', () => {
        expect(m['aqaba city']).toBe('Akaba');
        expect(m['العقبة']).toBe('Akaba');
    });
    it('resolves Jerash to TGX Gerasa', () => {
        expect(m['jerash ruins']).toBe('Gerasa');
        expect(m['جرش']).toBe('Gerasa');
    });
    it('resolves Dead Sea to TGX Suwaymah', () => {
        expect(m['dead sea jordan']).toBe('Suwaymah');
        expect(m['sweimeh']).toBe('Suwaymah');
    });
    it('resolves Wadi Musa (Petra area) as its own TGX city', () => {
        expect(m['wadi musa']).toBe('Wadi Musa');
    });
});

describe('KR (South Korea) aliases', () => {
    const m = CITY_ALIASES['KR'];
    it('resolves Incheon to TGX canonical', () => {
        expect(m['incheon']).toBe("Inch'on");
        expect(m['인천']).toBe("Inch'on");
    });
    it('resolves Daegu to TGX canonical', () => {
        expect(m['대구']).toBe('Daegu (und Umgebung)');
        expect(m['palgong mountain']).toBe('Daegu (und Umgebung)');
    });
    it('resolves Suncheon, Yeosu, Mokpo, etc. to TGX canonicals', () => {
        expect(m['suncheon']).toBe('Suncheon (und Umgebung)');
        expect(m['여수']).toBe('Yòsu');
        expect(m['목포']).toBe("Mokp'o");
        expect(m['군산']).toBe('Kunsan');
        expect(m['진주']).toBe('Chinju');
        expect(m['구미']).toBe('Kumi');
    });
});

describe('MY (Malaysia) aliases', () => {
    const m = CITY_ALIASES['MY'];
    it('resolves Johor Bahru to TGX Johore Baharu (838 hotels)', () => {
        expect(m['johor bahru']).toBe('Johore Baharu');
        expect(m['jb city']).toBe('Johore Baharu');
        expect(m['skudai']).toBe('Johore Baharu');
    });
    it('resolves Malacca to TGX Malakka (568 hotels)', () => {
        expect(m['malacca']).toBe('Malakka');
        expect(m['melaka']).toBe('Malakka');
        expect(m['jonker street']).toBe('Malakka');
    });
    it('resolves Genting Highlands to TGX canonical', () => {
        expect(m['genting highlands']).toBe('Genting Highlands (Berg)');
    });
    it('resolves Kuantan to TGX canonical', () => {
        expect(m['kuantan']).toBe('Kuantan (und Umgebung)');
        expect(m['cherating']).toBe('Kuantan (und Umgebung)');
    });
    it('resolves George Town as TGX city (not Penang)', () => {
        expect(m['george town']).toBe('George Town');
        expect(m['gurney drive']).toBe('George Town');
    });
    it('resolves Iskandar Puteri as separate TGX city (349 hotels)', () => {
        expect(m['iskandar']).toBe('Iskandar Puteri');
        expect(m['iskandar puteri']).toBe('Iskandar Puteri');
    });
});

describe('PK (Pakistan) aliases', () => {
    const m = CITY_ALIASES['PK'];
    it('resolves Skardu to TGX diacritic Skãrdu (118 hotels)', () => {
        expect(m['skardu']).toBe('Skãrdu');
        expect(m['fairy meadows']).toBe('Skãrdu');
    });
    it('resolves Naran to TGX diacritic Nārān (91 hotels)', () => {
        expect(m['naran']).toBe('Nārān');
        expect(m['kaghan']).toBe('Nārān');
    });
    it('resolves Abbottabad to TGX diacritic Abbottãbãd (41 hotels)', () => {
        expect(m['abbottabad']).toBe('Abbottãbãd');
    });
    it('resolves Chitral to TGX diacritic Chitrãl', () => {
        expect(m['chitral']).toBe('Chitrãl');
    });
    it('resolves Karimabad as its own TGX city (50 hotels)', () => {
        expect(m['karimabad']).toBe('Karimabad');
        expect(m['hunza']).toBe('Karimabad');
    });
});

describe('AE (UAE) aliases', () => {
    const m = CITY_ALIASES['AE'];
    it('resolves Fujairah to TGX Al Fudschaira (30 hotels)', () => {
        expect(m['fujairah city']).toBe('Al Fudschaira');
        expect(m['fujairah']).toBe('Al Fudschaira');
        expect(m['الفجيرة']).toBe('Al Fudschaira');
    });
    it('resolves Khor Fakkan and Kalba as separate TGX cities', () => {
        expect(m['khor fakkan']).toBe('Khor Fakkan');
        expect(m['kalba']).toBe('Kalba');
    });
    it('resolves Liwa Oasis to TGX Liwa-Oase', () => {
        expect(m['liwa oasis']).toBe('Liwa-Oase');
    });
    it('resolves Sir Bani Yas to TGX Insel Sir Bani Yas', () => {
        expect(m['sir bani yas island']).toBe('Insel Sir Bani Yas');
    });
    it('resolves Umm Al Quwain to TGX hyphenated form', () => {
        expect(m['umm al quwain city']).toBe('Umm al-Quwain');
        expect(m['umm al quwain']).toBe('Umm al-Quwain');
    });
    it('resolves newly added cities', () => {
        expect(m['al aqah']).toBe('Al Aqah');
        expect(m['madinat zayed']).toBe('Madinat Zayed');
        expect(m['hatta village']).toBe('Hatta');
        expect(m['damac hills']).toBe('Damac Hills');
    });
});

describe('IN (India) aliases', () => {
    const m = CITY_ALIASES['IN'];
    it('resolves Kolkata to TGX Kalkutta (959 hotels)', () => {
        expect(m['park street']).toBe('Kalkutta');
        expect(m['salt lake']).toBe('Kalkutta');
        expect(m['howrah']).toBe('Kalkutta');
    });
    it('resolves Guwahati to TGX diacritic Guwahãti', () => {
        expect(m['guwahati']).toBe('Guwahãti');
        expect(m['dispur']).toBe('Guwahãti');
    });
    it('resolves South Goa areas to TGX Süd-Goa (465 hotels)', () => {
        expect(m['palolem']).toBe('Süd-Goa');
        expect(m['south goa']).toBe('Süd-Goa');
        expect(m['colva']).toBe('Colva');
    });
    it('resolves North Goa areas to specific TGX cities', () => {
        expect(m['calangute']).toBe('Calangute');
        expect(m['vagator']).toBe('Vagator');
        expect(m['baga']).toBe('Baga');
        expect(m['anjuna']).toBe('Anjuna');
        expect(m['panaji']).toBe('Panaji');
    });
    it('resolves Ooty to TGX Udagamandalam (307 hotels)', () => {
        expect(m['ooty city']).toBe('Udagamandalam');
        expect(m['ooty']).toBe('Udagamandalam');
        expect(m['udhagamandalam']).toBe('Udagamandalam');
    });
    it('resolves Havelock Island to TGX Swaraj Dweep (67 hotels)', () => {
        expect(m['havelock island']).toBe('Swaraj Dweep');
    });
    it('resolves Vijayawada diacritic', () => {
        expect(m['vijayawada']).toBe('Vijayawãda');
    });
    it('resolves Vrindavan diacritic', () => {
        expect(m['vrindavan']).toBe('Vrindāvan');
        expect(m['mathura']).toBe('Vrindāvan');
    });
    it('resolves Khajuraho diacritic', () => {
        expect(m['khajuraho']).toBe('Khajurãho');
    });
    it('resolves Dwarka (Gujarat) to TGX Dvaraka', () => {
        expect(m['dwarka gujarat']).toBe('Dvaraka');
        expect(m['dwaraka']).toBe('Dvaraka');
    });
});

describe('PH (Philippines) aliases', () => {
    const m = CITY_ALIASES['PH'];

    it('resolves Metro Manila core districts to Manila', () => {
        expect(m['intramuros']).toBe('Manila');
        expect(m['malate']).toBe('Manila');
        expect(m['binondo']).toBe('Manila');
    });

    it('resolves Makati CBD to TGX Makati (406 hotels)', () => {
        expect(m['makati']).toBe('Makati');
        expect(m['makati city']).toBe('Makati');
        expect(m['bgc']).toBe('Taguig City');
        expect(m['bonifacio global city']).toBe('Taguig City');
        expect(m['taguig']).toBe('Taguig City');
    });

    it('resolves Pasay / Bay Area to TGX Pasay (495 hotels)', () => {
        expect(m['pasay']).toBe('Pasay');
        expect(m['mall of asia']).toBe('Pasay');
        expect(m['entertainment city']).toBe('Pasay');
        expect(m['solaire']).toBe('Pasay');
    });

    it('resolves Quezon City to TGX Quezon City (331 hotels)', () => {
        expect(m['quezon city']).toBe('Quezon City');
        expect(m['cubao']).toBe('Quezon City');
        expect(m['diliman']).toBe('Quezon City');
        expect(m['trinoma']).toBe('Quezon City');
    });

    it('resolves Parañaque to TGX Parañaque (228 hotels)', () => {
        expect(m['paranaque']).toBe('Parañaque');
        expect(m['sucat']).toBe('Parañaque');
        expect(m['baclaran']).toBe('Parañaque');
    });

    it('resolves Mandaluyong / Ortigas to TGX Mandaluyong (93 hotels)', () => {
        expect(m['mandaluyong']).toBe('Mandaluyong');
        expect(m['ortigas']).toBe('Mandaluyong');
        expect(m['shaw']).toBe('Mandaluyong');
    });

    it('resolves Pasig / Eastwood to TGX Pasig (70 hotels)', () => {
        expect(m['pasig']).toBe('Pasig');
        expect(m['eastwood']).toBe('Pasig');
        expect(m['kapitolyo']).toBe('Pasig');
    });

    it('resolves Muntinlupa / Alabang to TGX Muntinlupa (56 hotels)', () => {
        expect(m['muntinlupa']).toBe('Muntinlupa');
        expect(m['alabang']).toBe('Muntinlupa');
        expect(m['festival mall']).toBe('Muntinlupa');
    });

    it('resolves Las Piñas to TGX Las Piñas (37 hotels)', () => {
        expect(m['las pinas']).toBe('Las Piñas');
        expect(m['bf homes']).toBe('Las Piñas');
    });

    it('resolves Antipolo to TGX Antipolo (25 hotels)', () => {
        expect(m['antipolo']).toBe('Antipolo');
        expect(m['cainta']).toBe('Antipolo');
    });

    it('resolves Boracay to TGX Boracay Island (411 hotels)', () => {
        expect(m['station 1']).toBe('Boracay Island');
        expect(m['white beach boracay']).toBe('Boracay Island');
        expect(m['caticlan']).toBe('Boracay Island');
        expect(m['d mall']).toBe('Boracay Island');
    });

    it('resolves Cebu to TGX Cebu (385 hotels)', () => {
        expect(m['it park']).toBe('Cebu');
        expect(m['ayala center cebu']).toBe('Cebu');
        expect(m['colon cebu']).toBe('Cebu');
    });

    it('resolves Lapu-Lapu / Mactan to TGX Lapu Lapu (318 hotels)', () => {
        expect(m['lapu-lapu']).toBe('Lapu Lapu');
        expect(m['lapu lapu']).toBe('Lapu Lapu');
        expect(m['mactan']).toBe('Lapu Lapu');
        expect(m['maribago']).toBe('Lapu Lapu');
        expect(m['mactan cebu airport area']).toBe('Lapu Lapu');
    });

    it('resolves Mandaue to TGX Mandaue (62 hotels)', () => {
        expect(m['mandaue']).toBe('Mandaue');
        expect(m['mandaue city']).toBe('Mandaue');
    });

    it('resolves Davao to TGX Davao (237 hotels)', () => {
        expect(m['lanang']).toBe('Davao');
        expect(m['downtown davao']).toBe('Davao');
        expect(m['abreeza']).toBe('Davao');
    });

    it('resolves Iloilo to TGX Iloilo (230 hotels)', () => {
        expect(m['smallville']).toBe('Iloilo');
        expect(m['jaro']).toBe('Iloilo');
        expect(m['festive walk']).toBe('Iloilo');
    });

    it('resolves Bohol — Panglao, Tawala, Dauis as separate TGX cities', () => {
        expect(m['panglao']).toBe('Panglao');
        expect(m['alona beach']).toBe('Panglao');
        expect(m['tawala']).toBe('Tawala');
        expect(m['dauis']).toBe('Dauis');
        expect(m['chocolate hills']).toBe('Tagbilaran');
    });

    it('resolves Siargao to TGX General Luna (161 hotels)', () => {
        expect(m['cloud 9']).toBe('General Luna');
        expect(m['general luna siargao']).toBe('General Luna');
        expect(m['dapa']).toBe('General Luna');
    });

    it('resolves Camiguin to TGX Mambajao (66 hotels)', () => {
        expect(m['mambajao']).toBe('Mambajao');
        expect(m['camiguin']).toBe('Mambajao');
        expect(m['camiguin island']).toBe('Mambajao');
    });

    it('resolves Pagudpud as separate TGX city (24 hotels)', () => {
        expect(m['pagudpud']).toBe('Pagudpud');
    });

    it('resolves Dauin as separate TGX city (24 hotels)', () => {
        expect(m['dauin']).toBe('Dauin');
        expect(m['apo island']).toBe('Dauin');
    });
});
