// Maps each non-TGX PH alias target → nearest TGX PH city
import { readFileSync, writeFileSync } from 'fs';

const REMAP = {
    // Cagayan Valley
    'Abulug': 'Aparri',
    'Adams': 'Laoag',
    'Gonzaga': 'Aparri',
    'Gattaran': 'Aparri',
    'Lasam': 'Aparri',
    'Tuao': 'Tuguegarao',
    'Baggao': 'Aparri',
    'Bayombong': 'Santiago',
    'Bambang': 'Santiago',
    'Dupax del Norte': 'Santiago',
    'Kasibu': 'Santiago',
    'Nagtipunan': 'Santiago',
    'Cabarroguis': 'Santiago',
    'Diffun': 'Santiago',
    'Maddela': 'Santiago',
    // Cordillera / Mountain Province
    'Bontoc': 'Baguio',
    'Besao': 'Baguio',
    'Sabangan': 'Baguio',
    'Tadian': 'Baguio',
    'Kabayan': 'Baguio',
    'Kapangan': 'Baguio',
    'Kibungan': 'Baguio',
    'Tublay': 'Baguio',
    'Atok': 'Baguio',
    'Buguias': 'Baguio',
    'Tubao': 'Baguio',
    'Lamut': 'Banaue',
    'Hingyon': 'Banaue',
    'Lagawe': 'Banaue',
    'Aguinaldo': 'Banaue',
    // Kalinga
    'Balbalan': 'Tabuk',
    'Lubuagan': 'Tabuk',
    'Pinukpuk': 'Tabuk',
    'Tinglayan': 'Tabuk',
    'Tanudan': 'Tabuk',
    // Apayao
    'Kabugao': 'Tabuk',
    // Abra
    'Lagangilang': 'Bangued',
    // Ilocos Norte
    'Dingras': 'Laoag',
    'Nueva Era': 'Laoag',
    'Piddig': 'Laoag',
    'Solsona': 'Laoag',
    'Vintar': 'Laoag',
    'Luna': 'Laoag',
    // Ilocos Sur
    'Narvacan': 'Vigan',
    'Pidigan': 'Vigan',
    'Tayum': 'Vigan',
    'Santa': 'Vigan',
    // Pangasinan
    'Mangatarem': 'Dagupan',
    'Aguilar': 'Dagupan',
    'Binmaley': 'Dagupan',
    'Bolinao': 'Dagupan',
    'Bugallon': 'Dagupan',
    'Villasis': 'Urdaneta',
    'Bautista': 'Urdaneta',
    'Tayug': 'Urdaneta',
    // Nueva Ecija
    'Aliaga': 'Cabanatuan',
    'Munoz': 'Cabanatuan',
    'Palayan City': 'Cabanatuan',
    // Pampanga / Bulacan / Tarlac
    'Apalit': 'Angeles',
    'Masantol': 'Angeles',
    'Macabebe': 'Angeles',
    'San Simon': 'Angeles',
    'Bacolor': 'Angeles',
    'Arayat': 'Angeles',
    'Lubao': 'Angeles',
    'San Luis': 'Angeles',
    'Bamban': 'Tarlac',
    'Camiling': 'Tarlac',
    'Anao': 'Tarlac',
    'Balagtas': 'Malolos',
    'Bocaue': 'Malolos',
    'Norzagaray': 'Malolos',
    'Obando': 'Malolos',
    'San Miguel': 'Malolos',
    // Aurora
    'Dinalungan': 'Baler',
    'Anda': 'Baler',
    // Cavite
    'Cavite City': 'Cavite',
    'Carmona': 'Silang',
    'Kawit': 'Bacoor',
    // Rizal / Laguna
    'Cardona': 'Antipolo',
    'Rodriguez': 'Antipolo',
    'San Mateo': 'Antipolo',
    'Teresa': 'Antipolo',
    'Baras': 'Antipolo',
    'Pililla': 'Antipolo',
    'Rizal': 'Antipolo',
    'Los Baños': 'Calamba',
    'Siniloan': 'Calamba',
    'Pakil': 'Calamba',
    'Calauan': 'Calamba',
    'Biñan': 'Calamba',
    // Quezon Province
    'Sariaya': 'Lucena',
    'Quezon': 'Lucena',
    'Atimonan': 'Lucena',
    'Gumaca': 'Lucena',
    'Calauag': 'Lucena',
    'Catanauan': 'Lucena',
    'Mulanay': 'Lucena',
    'Pitogo': 'Lucena',
    'Macalelon': 'Lucena',
    'Majayjay': 'Lucena',
    // Camarines Norte / Sur
    'Labo': 'Daet',
    'Baao': 'Naga',
    'Calabanga': 'Naga',
    'Goa': 'Naga',
    'Tinambac': 'Naga',
    // Catanduanes
    'Bagamanoc': 'Legazpi',
    'Pandan Catanduanes': 'Legazpi',
    'Viga': 'Legazpi',
    'Gigmoto': 'Legazpi',
    // Sorsogon
    'Jovellar': 'Sorsogon',
    // Batanes
    'Batanes': 'Basco',
    'Itbayat': 'Basco',
    // Batangas
    'Agoncillo': 'Batangas',
    'Alitagtag': 'Batangas',
    'Tingloy': 'Batangas',
    'Lemery': 'Batangas',
    // Iloilo
    'Barotac Nuevo': 'Iloilo',
    'Barotac Viejo': 'Iloilo',
    'Oton': 'Iloilo',
    'Mina': 'Iloilo',
    'Duenas': 'Iloilo',
    'Passi': 'Iloilo',
    // Aklan / Antique
    'Buruanga': 'Kalibo',
    'Tibiao': 'Roxas City',
    'San Jose de Buenavista': 'Roxas City',
    // Capiz
    // Biliran
    'Caibiran': 'Naval',
    'Kawayan': 'Naval',
    'Almeria': 'Naval',
    // Negros Occidental
    'Sagay': 'Bacolod',
    'Escalante': 'Bacolod',
    'Himamaylan': 'Bacolod',
    'Pontevedra': 'Bacolod',
    'San Enrique': 'Bacolod',
    'La Carlota': 'Bacolod',
    'Victorias': 'Bacolod',
    // Cebu
    'Camotes': 'Cebu',
    'Malapascua': 'Cebu',
    'Barili': 'Cebu',
    'Alcantara': 'Cebu',
    'Alcoy': 'Cebu',
    'Alegria': 'Cebu',
    'Aloguinsan': 'Cebu',
    'Asturias': 'Cebu',
    'Baclayon': 'Tagbilaran',
    'Boljoon': 'Cebu',
    'Basdiot': 'Cebu',
    'Toledo': 'Cebu',
    'Talisay City': 'Cebu',
    // Bohol
    'Bien Unido': 'Tagbilaran',
    'Inabanga': 'Tagbilaran',
    'Ubay': 'Tagbilaran',
    // Southern Leyte / Leyte
    'Maasin': 'Ormoc',
    'Sogod': 'Ormoc',
    // Misamis Occidental
    'Jimenez': 'Oroquieta',
    'Tangub City': 'Ozamis City',
    'Ozamiz City': 'Ozamis City',
    // Palawan
    'Narra': 'Puerto Princesa',
    'Dumaran': 'Puerto Princesa',
    'Linapacan': 'Puerto Princesa',
    'Sofronio Española': 'Puerto Princesa',
    'Bataraza': 'Puerto Princesa',
    // Romblon
    'Magdiwang': 'Romblon',
    'Monreal': 'Romblon',
    'Torrijos': 'Romblon',
    // Surigao del Sur
    'Cantilan': 'Surigao',
    'Lanuza': 'Bislig',
    'Lianga': 'Bislig',
    // Agusan / Surigao
    'Nasipit': 'Butuan',
    'Jabonga': 'Butuan',
    'Cabadbaran': 'Butuan',
    'Bayugan': 'Butuan',
    'Prosperidad': 'Butuan',
    // Bukidnon
    'Impasugong': 'Malaybalay',
    'Valencia City': 'Valencia',
    'Don Carlos': 'Malaybalay',
    'Kibawe': 'Malaybalay',
    // Davao del Norte
    'New Corella': 'Tagum',
    'Kapalong': 'Tagum',
    'Talaingod': 'Tagum',
    'Santa Teresita': 'Tagum',
    'Pantukan': 'Nabunturan',
    // Davao Oriental
    'Baganga': 'Mati',
    'Banaybanay': 'Mati',
    'Manay': 'Mati',
    'Tarragona': 'Mati',
    'Cateel': 'Mati',
    // Davao City area
    'New Bataan': 'Davao City',
    'Montevista': 'Nabunturan',
    'Mawab': 'Nabunturan',
    // Cotabato
    'Arakan': 'Cotabato',
    'Kabacan': 'Cotabato',
    'Magpet': 'Kidapawan',
    // Sarangani / South Cotabato
    'Glan': 'General Santos',
    'Kiamba': 'General Santos',
    'Maitum': 'General Santos',
    'Malapatan': 'General Santos',
    "T'Boli": 'General Santos',
    'Lambayong': 'Koronadal',
    'Surallah': 'Koronadal',
    'Norala': 'Koronadal',
    'Banga': 'Koronadal',
    'Tacurong': 'Koronadal',
    // Sultan Kudarat
    'Isulan': 'Koronadal',
    'Lebak': 'Cotabato',
    // Lanao del Norte
    'Marawi': 'Iligan',
    'Lanao del Norte': 'Iligan',
    'Wao': 'Iligan',
    // Zamboanga Peninsula
    'Isabela City': 'Zamboanga',
    'Kabasalan': 'Zamboanga',
    'Turtle Islands': 'Zamboanga',
    // Sulu / Tawi-Tawi
    'Jolo': 'Zamboanga',
    'Indanan': 'Zamboanga',
    'Patikul': 'Zamboanga',
    'Bongao': 'Zamboanga',
    'Sapa-Sapa': 'Zamboanga',
    'Tandubas': 'Zamboanga',
    // Lamitan / Basilan
    'Lamitan': 'Zamboanga',
    // Pagadian
    'Malabang': 'Pagadian',
    // Misamis Oriental
    'Balingasag': 'Cagayan de Oro',
    'El Salvador': 'Cagayan de Oro',
    'Initao': 'Cagayan de Oro',
    'Villanueva': 'Cagayan de Oro',
    'Jasaan': 'Cagayan de Oro',
    'Baungon': 'Cagayan de Oro',
};

const filePath = './src/lib/constants/cityAliases.ts';
let content = readFileSync(filePath, 'utf8');

let fixes = 0;
for (const [from, to] of Object.entries(REMAP)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(:\\s*)'${escaped}'`, 'g');
    const newContent = content.replace(re, `$1'${to}'`);
    if (newContent !== content) {
        fixes++;
        content = newContent;
    } else {
        // Only warn if this city appears in the mismatch list
        // console.log(`  no match for: ${from}`);
    }
}

writeFileSync(filePath, content);
console.log(`Applied ${fixes} remaps out of ${Object.keys(REMAP).length} entries`);
