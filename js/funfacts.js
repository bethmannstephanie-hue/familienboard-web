// „Wusstest du?“ – ein Fun Fact pro Tag (E32). Gleiche Liste wie FunFacts.kt in der App (Test prüft das).
export const FUN_FACTS = [
  "Ein Oktopus hat drei Herzen und blaues Blut.",
  "Honig verdirbt praktisch nie – in alten ägyptischen Gräbern fand man noch essbaren Honig.",
  "Ein Tag auf der Venus dauert länger als ein ganzes Venus-Jahr.",
  "Bananen sind botanisch gesehen Beeren – Erdbeeren dagegen nicht.",
  "Der Eiffelturm ist im Sommer bis zu 15 Zentimeter höher, weil sich das Metall in der Wärme ausdehnt.",
  "Das Herz eines Blauwals wiegt rund 180 Kilogramm.",
  "Seesterne haben kein Gehirn.",
  "Koalas schlafen bis zu 20 Stunden am Tag.",
  "Flamingos sind rosa, weil sie kleine Krebse und Algen fressen.",
  "Babys kommen mit rund 300 Knochen auf die Welt, Erwachsene haben nur noch 206 – viele wachsen zusammen.",
  "Das Licht der Sonne braucht etwa 8 Minuten bis zur Erde.",
  "Giraffen haben genauso viele Halswirbel wie Menschen: sieben.",
  "Kolibris können rückwärts fliegen.",
  "Der Mount Everest wird jedes Jahr ein paar Millimeter höher.",
  "Fast alle Pinguine leben auf der Südhalbkugel der Erde.",
  "Ameisen können ein Vielfaches ihres eigenen Körpergewichts tragen.",
  "Auf dem Mond gibt es keinen Wind – die Fußabdrücke der Astronauten sind wohl heute noch da.",
  "Haie gab es schon lange vor den Dinosauriern.",
  "Schmetterlinge schmecken mit ihren Füßen.",
  "Delfine schlafen immer nur mit einer Hälfte ihres Gehirns.",
  "Die Chinesische Mauer kann man vom Mond aus nicht mit bloßem Auge sehen.",
  "Ein Jahr auf dem Neptun dauert etwa 165 Erdenjahre.",
  "Elefanten können nicht springen.",
  "Eulen können ihren Kopf um bis zu 270 Grad drehen.",
  "Das deutsche Wort „Kindergarten“ benutzt man auch im Englischen.",
  "Für ein Glas Honig fliegen Bienen zusammen ungefähr dreimal um die Erde.",
  "Wombats machen würfelförmige Häufchen.",
  "Seeotter halten sich beim Schlafen an den Pfoten, damit sie nicht auseinandertreiben.",
  "Ein Blitz ist heißer als die Oberfläche der Sonne.",
  "Kein Zebra hat dasselbe Streifenmuster wie ein anderes.",
  "Kraken können ihre Farbe in Sekundenbruchteilen ändern.",
  "Im Weltall gibt es mehr Sterne als Sandkörner an allen Stränden der Erde.",
  "Das Schneckenhaus wächst mit der Schnecke mit.",
  "Ein Igel hat ungefähr 7.000 Stacheln.",
  "Krokodile können ihre Zunge nicht herausstrecken.",
  "Am Äquator dreht sich die Erde mit über 1.600 Kilometern pro Stunde.",
  "Ein Regenbogen ist eigentlich ein Kreis – vom Boden aus sieht man nur einen Teil davon.",
  "Katzen verbringen etwa zwei Drittel ihres Lebens mit Schlafen.",
  "Vögel stammen von Dinosauriern ab – ein Huhn ist entfernt mit dem T. rex verwandt.",
  "In den Höckern eines Kamels steckt Fett, kein Wasser.",
  "Die Venus ist der heißeste Planet, obwohl der Merkur näher an der Sonne ist.",
  "Ein Specht kann etwa 20-mal pro Sekunde gegen einen Baum klopfen.",
];

const DAY = 86400000;
/** Satz des Tages für ein Datum 'YYYY-MM-DD' (Tage seit 1970 wie toEpochDay in der App). */
export function factOfDay(iso) {
  const n = Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);
  return FUN_FACTS[((n % FUN_FACTS.length) + FUN_FACTS.length) % FUN_FACTS.length];
}
