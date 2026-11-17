// Programmes d'entraînement : poids du corps à la maison + course sur le halage.
// Les valeurs [a, b, c] correspondent aux niveaux 1 (débutant), 2 (intermédiaire), 3 (avancé).

const EXOS = {
  squat:     { n: 'Squats', c: "Pieds largeur d'épaules, descends comme pour t'asseoir. Talons au sol, dos droit." },
  fente:     { n: 'Fentes alternées', c: 'Grand pas en avant, le genou arrière frôle le sol. Une jambe = 1 répétition.' },
  pont:      { n: 'Pont fessier', c: 'Sur le dos, pieds au sol. Monte le bassin en serrant les fessiers, tiens 1 s en haut.' },
  chaise:    { n: 'Chaise contre le mur', c: 'Dos au mur, cuisses parallèles au sol. Respire calmement.' },
  mollets:   { n: 'Mollets debout', c: 'Monte sur la pointe des pieds, redescends lentement. Appuie-toi au mur si besoin.' },
  pompes:    { n: 'Pompes', c: 'Débutant : mains sur le canapé ou genoux au sol. Corps gainé, poitrine vers le sol.' },
  dips:      { n: 'Dips sur chaise', c: 'Mains sur une chaise stable derrière toi. Plie les coudes à 90°, remonte.' },
  superman:  { n: 'Superman', c: 'Sur le ventre, lève bras et jambes 2 s, redescends. Regard vers le sol.' },
  pike:      { n: 'Pompes piquées', c: "Fesses en l'air en V inversé, plie les bras pour approcher la tête du sol." },
  planche:   { n: 'Planche', c: 'Sur les avant-bras, corps aligné des épaules aux talons. Serre ventre et fessiers.' },
  jj:        { n: 'Jumping jacks', c: 'Saute en écartant bras et jambes, puis reviens. Rythme régulier.' },
  mountain:  { n: 'Mountain climbers', c: 'Position de pompe, ramène les genoux vers la poitrine en alternance.' },
  squatjump: { n: 'Squats sautés', c: 'Squat puis saut, réception souple. Version douce : squat + pointe des pieds.' },
  lateral:   { n: 'Planche latérale', c: 'Sur un avant-bras, corps aligné. Change de côté à la moitié du temps.' },
  burpees:   { n: 'Burpees', c: 'Accroupi, pieds en arrière, retour, saut. Version douce : sans saut ni pompe.' },
};

// mode 'r' = répétitions, 's' = secondes
const SEANCES = {
  A: {
    id: 'A', titre: 'Jambes & fessiers', type: 'muscu',
    rounds: [2, 3, 4], restEx: 30, restRound: 75,
    items: [
      ['squat', 'r', [10, 15, 20]],
      ['fente', 'r', [10, 16, 20]],
      ['pont', 'r', [12, 15, 20]],
      ['chaise', 's', [20, 35, 50]],
      ['mollets', 'r', [15, 20, 25]],
    ],
  },
  B: {
    id: 'B', titre: 'Haut du corps', type: 'muscu',
    rounds: [2, 3, 4], restEx: 30, restRound: 75,
    items: [
      ['pompes', 'r', [6, 10, 15]],
      ['dips', 'r', [6, 10, 14]],
      ['superman', 'r', [8, 12, 15]],
      ['pike', 'r', [5, 8, 12]],
      ['planche', 's', [20, 35, 50]],
    ],
  },
  C: {
    id: 'C', titre: 'Cardio & gainage', type: 'hiit',
    rounds: [2, 3, 4], restEx: [30, 20, 15], restRound: 60,
    items: [
      ['jj', 's', [30, 40, 45]],
      ['mountain', 's', [20, 30, 40]],
      ['squatjump', 's', [20, 30, 40]],
      ['lateral', 's', [20, 30, 40]],
      ['burpees', 's', [20, 30, 40]],
    ],
  },
};

// Course sur le halage : b = [secondes de course, secondes de marche, répétitions]
// Le niveau décale le point de départ : débutant = 0, intermédiaire = 3, avancé = 7.
const COURSE = [
  { t: 'Fractionné 8 × 1 min', b: [60, 90, 8] },
  { t: 'Fractionné 6 × 2 min', b: [120, 90, 6] },
  { t: 'Fractionné 5 × 3 min', b: [180, 90, 5] },
  { t: 'Fractionné 4 × 5 min', b: [300, 120, 4] },
  { t: 'Fractionné 3 × 8 min', b: [480, 120, 3] },
  { t: 'Fractionné 2 × 12 min', b: [720, 120, 2] },
  { t: 'Fractionné 2 × 15 min', b: [900, 60, 2] },
  { t: 'Course continue 30 min', b: [1800, 0, 1] },
  { t: 'Course continue 35 min', b: [2100, 0, 1] },
  { t: 'Course continue 40 min', b: [2400, 0, 1] },
];
const COURSE_OFFSET = [0, 3, 7];

// Semaine type (getDay : 0 = dimanche)
const DAY_PLAN = { 1: 'A', 2: 'run', 3: 'B', 5: 'C', 6: 'run' };

const NIVEAUX = [
  { v: 1, t: 'Débutant', d: "Je reprends ou je n'ai jamais vraiment fait de sport." },
  { v: 2, t: 'Intermédiaire', d: 'Je bouge un peu, je cours 15 min sans m’arrêter.' },
  { v: 3, t: 'Avancé', d: 'Je fais déjà des pompes et je cours 30 min.' },
];

const COLORS = { orange: '#ff7a3d', teal: '#35c6a8' };

// Base partagée (clé publique, faite pour être dans une app ; les données sont verrouillées par le code du couple).
const HALAGE_DB = { url: 'https://fqrduogjgkmuisdlvfwp.supabase.co', key: 'sb_publishable_4XLag0jVQ-ufkQUTmaqegw_DfF7htsb' };

// Version sans saut (IMC ≥ 30 ou genoux sensibles) : même effort cardio, moins d'impact.
Object.assign(EXOS, {
  stepjack:     { n: 'Pas chassés bras levés', c: "Écarte une jambe puis l'autre en levant les bras. Sans saut, doux pour les genoux." },
  squatfast:    { n: 'Squats rapides', c: 'Squats sans saut, rythme soutenu, amplitude confortable.' },
  burpeesoft:   { n: 'Burpees sans saut', c: "Mains sur une chaise, recule un pied puis l'autre, reviens, monte sur la pointe des pieds." },
  mountainslow: { n: 'Mountain climbers inclinés', c: 'Mains sur le canapé, ramène un genou puis l’autre, contrôlé.' },
});
const LOW_IMPACT = { jj: 'stepjack', squatjump: 'squatfast', burpees: 'burpeesoft', mountain: 'mountainslow' };

// Dépense : MET × poids (kg) × heures (Compendium of Physical Activities, valeurs moyennes séance + repos)
const MET = { muscu: 4.5, hiit: 7.0, course: 7.0, marche: 3.8, velo: 6.8, autre: 4.0 };

const OBJECTIFS = [
  { v: 'perte', t: 'Perdre du poids', d: 'Déficit modéré (max 500 kcal), protéines hautes pour garder le muscle.' },
  { v: 'recompo', t: 'Perdre du gras et prendre du muscle', d: 'Petit déficit de 10 %, protéines hautes.' },
  { v: 'muscle', t: 'Prendre du muscle', d: 'Léger surplus de 10 %.' },
];
