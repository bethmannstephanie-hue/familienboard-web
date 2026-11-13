// Einkaufsliste: Abteilungen und Zerlegen von Eingaben – erzeugt aus Shopping.kt (gleiche Sortierung wie Android und Alexa).
export const OTHER = 'Sonstiges';
export const CATEGORIES = [["Obst & Gemüse", ["apfel", "äpfel", "banane", "birne", "orange", "mandarine", "zitrone", "limette", "traube", "beere", "erdbeer", "himbeer", "heidelbeer", "tomate", "gurke", "salat", "paprika", "zwiebel", "kartoffel", "karotte", "möhre", "knoblauch", "zucchini", "brokkoli", "blumenkohl", "pilz", "champignon", "avocado", "kiwi", "mango", "ananas", "melone", "lauch", "porree", "spinat", "obst", "gemüse", "kräuter", "petersilie", "basilikum", "schnittlauch", "radieschen", "sellerie", "aubergine", "kohl", "ingwer", "mais"]], ["Brot & Backwaren", ["brot", "brötchen", "toast", "croissant", "baguette", "kuchen", "brezel", "laugen", "semmel"]], ["Milch & Kühlregal", ["milch", "joghurt", "jogurt", "quark", "käse", "butter", "sahne", "schmand", "frischkäse", "ei", "eier", "margarine", "mozzarella", "feta", "pudding", "wurst", "schinken", "salami", "aufschnitt", "tofu", "creme fraiche", "crème fraîche", "skyr", "kefir", "parmesan", "gouda"]], ["Fleisch & Fisch", ["fleisch", "hähnchen", "huhn", "hühnchen", "pute", "hack", "rind", "schwein", "steak", "schnitzel", "fisch", "lachs", "thunfisch", "garnele", "würstchen", "bratwurst", "speck", "gulasch"]], ["Vorrat", ["nudel", "pasta", "spaghetti", "reis", "mehl", "zucker", "salz", "öl", "olivenöl", "essig", "müsli", "haferflocken", "cornflakes", "marmelade", "honig", "nutella", "konserve", "dose", "tomatensoße", "tomatensauce", "passierte tomaten", "soße", "sauce", "ketchup", "senf", "mayo", "gewürz", "pfeffer", "brühe", "linsen", "bohnen", "kichererbsen", "kaffee", "tee", "kakao", "backpulver", "hefe", "vanille", "Paprika edelsüß", "Thymian, getrocknet", "Chili, gemahlen", "gemahlen", "getrocknet", "paprika edelsüß", "paprika rosenscharf", "paprikapulver", "tomatenmark", "oregano", "zimt", "muskat", "curry", "kreuzkümmel", "kokosmilch", "speisestärke", "gewürzpaste"]], ["Süßes & Snacks", ["schokolade", "schoki", "chips", "kekse", "keks", "gummibärchen", "süßigkeit", "bonbon", "nüsse", "popcorn", "riegel", "salzstangen", "cracker"]], ["Getränke", ["wasser", "saft", "apfelsaft", "orangensaft", "cola", "limo", "limonade", "bier", "wein", "sprudel", "schorle", "apfelschorle", "eistee", "sirup"]], ["Tiefkühl", ["tiefkühl", "tk ", "pizza", "pommes", "fischstäbchen", "eis", "eiscreme", "kroketten"]], ["Drogerie & Haushalt", ["zahnpasta", "zahnbürste", "shampoo", "duschgel", "seife", "deo", "toilettenpapier", "klopapier", "küchenrolle", "taschentücher", "spülmittel", "waschmittel", "weichspüler", "müllbeutel", "schwamm", "creme", "windeln", "spülmaschinentabs", "tabs", "alufolie", "frischhaltefolie", "batterie", "pflaster", "rasier", "tampons", "binden", "wattepads", "putzmittel", "glühbirne"]]];
const ORDER = [...CATEGORIES.map((c) => c[0]), OTHER];

export function categoryRank(cat) { const i = ORDER.indexOf(cat); return i < 0 ? ORDER.length : i; }

/** Abteilung zu einem Artikel; bei mehreren Treffern gewinnt das längste Stichwort. */
export function categoryOf(item) {
  const name = String(item).replace(/\s*\([^()]*\)\s*$/, '');
  const text = ' ' + name.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ') + ' ';
  const words = text.split(' ').filter(Boolean);
  let best = null;
  let bestLen = 0;
  for (const [cat, keys] of CATEGORIES) {
    for (const k of keys) {
      const hit = k.trim().length <= 4 ? words.includes(k.trim()) : text.includes(k);
      if (hit && k.length > bestLen) { best = cat; bestLen = k.length; }
    }
  }
  return best || OTHER;
}

/** "Milch, Brot und Nudeln" -> ["Milch", "Brot", "Nudeln"] */
export function parseItems(input) {
  const seen = new Set();
  return String(input).split(/,|;|\n|\s+und\s+|\s+sowie\s+|\s+plus\s+/i)
    .map((s) => s.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim().replace(/^[.!?]+|[.!?]+$/g, ''))
    .filter((s) => s.length >= 2)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .filter((s) => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
