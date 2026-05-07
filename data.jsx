// Campus data — coordinates calibrated to campus-map.png (1212x1084) via color-cluster detection.
// All x/y/w/h are in PNG pixel space. SVG uses viewBox="0 0 1212 1084" so coordinates match directly.

const MAP_IMG = { w: 1212, h: 1084, src: "campus-map.png" };

const BUILDINGS = [
  // ============ NORTH-WEST CLUSTER ============
  // Cypress Building (yellow K) — top
  { code: "K",  name: "Cypress Building",                 cat: "admin",     x: 290, y: 127, w: 48,  h: 38, label: "Cypress" },
  // Medical Records / Patient Support (yellow N, between Cypress and Med Center)
  { code: "N",  name: "Medical Records / Patient Support",cat: "admin",     x: 351, y: 184, w: 56,  h: 48, label: "Patient Support" },
  // P1 staff parking (beige)
  { code: "P1", name: "Parking 1 (staff only)",           cat: "parking",   x: 245, y: 178, w: 50,  h: 48, label: "P1" },

  // ============ MEDICAL CENTER CORE ============
  { code: "T",  name: "Medical Center",                   cat: "hospital",  x: 300, y: 188, w: 232, h: 144, label: "Medical Center" },
  // California Tower attached to right of Med Center
  { code: "U",  name: "California Tower",                 cat: "hospital",  x: 470, y: 240, w: 75,  h: 92, label: "Cal Tower" },
  // Pathology Building (small navy block north of Med Center)
  { code: "I",  name: "Pathology Building",               cat: "research",  x: 420, y: 195, w: 60,  h: 45, label: "Pathology" },
  // North Addition (W) — small navy block
  { code: "W",  name: "North Addition",                   cat: "hospital",  x: 360, y: 155, w: 65,  h: 40, label: "North Addition" },

  // ============ EAST OF MEDICAL CENTER ============
  // Cancer Center North (cyan)
  { code: "M",  name: "Comprehensive Cancer Center North",cat: "clinic",    x: 591, y: 301, w: 64,  h: 41, label: "Cancer N" },
  // Cancer Center South (cyan, just below)
  { code: "L",  name: "Comprehensive Cancer Center South",cat: "clinic",    x: 574, y: 338, w: 71,  h: 40, label: "Cancer S" },
  // P5 (dark gray, contractor) — between Cancer & 48X
  { code: "P5", name: "Parking 5 (contractor only)",      cat: "parking",   x: 670, y: 290, w: 105, h: 50, label: "P5" },
  // P4 (bright green parking lot) + 48X Complex share rectangle (P4 top, 48X bottom)
  { code: "P4", name: "Parking 4",                        cat: "parking",   x: 777, y: 307, w: 110, h: 35, label: "P4" },
  { code: "A",  name: "48X Complex",                      cat: "education", x: 777, y: 348, w: 110, h: 36, label: "48X Complex" },

  // ============ FAR-WEST CLUSTER ============
  // Behavioral Health Center (cyan, far left)
  { code: "Y",  name: "Behavioral Health Center",         cat: "clinic",    x: 95,  y: 200, w: 90,  h: 35, label: "Behavioral Health" },
  // Children's Behavioral Health (cyan, below)
  { code: "Z",  name: "Children's Behavioral Health",     cat: "clinic",    x: 130, y: 250, w: 95,  h: 50, label: "Children's BH" },
  // Hotel Med Park (yellow-orange, mid-left)
  { code: "Hp", name: "Hotel Med Park",                   cat: "external",  x: 200, y: 320, w: 80,  h: 35, label: "Hotel Med Park" },
  // Sherman Building (small)
  { code: "Sh", name: "Sherman Building",                 cat: "external",  x: 195, y: 270, w: 75,  h: 32, label: "Sherman" },
  // Davis I & II
  { code: "D1", name: "Davis I Building",                 cat: "external",  x: 215, y: 365, w: 80,  h: 30, label: "Davis I" },
  { code: "D2", name: "Davis II Building",                cat: "external",  x: 215, y: 400, w: 80,  h: 30, label: "Davis II" },
  // Western Fairs Building
  { code: "WF", name: "Western Fairs Building",           cat: "external",  x: 230, y: 442, w: 80,  h: 35, label: "Western Fairs" },
  // Ticon I (small bldg between Western Fairs and main)
  { code: "T1", name: "Ticon I",                          cat: "external",  x: 290, y: 478, w: 50,  h: 30, label: "Ticon I" },
  // Ticon II (top-far-left)
  { code: "T2", name: "Ticon II",                         cat: "external",  x: 80,  y: 30,  w: 60,  h: 30, label: "Ticon II" },

  // ============ MEDICAL CENTER NORTH (small bldgs above Med Ctr) ============
  // Gratitude Garden (small, NW of Med Ctr)
  { code: "GG", name: "Gratitude Garden",                 cat: "amenity",   x: 360, y: 130, w: 55,  h: 22, label: "Gratitude Garden" },
  // Police (small, between Cypress and Pathology)
  { code: "PO", name: "Police / Public Safety",           cat: "admin",     x: 348, y: 130, w: 36,  h: 38, label: "Police" },

  // ============ P3 PARKING (green, hospital main) ============
  { code: "P3", name: "Parking 3 (hospital main)",        cat: "parking",   x: 298, y: 297, w: 71,  h: 80, label: "P3" },

  // ============ CENTER-EAST: Shriners + courtyard area ============
  // Shriners Hospital (gray)
  { code: "SH", name: "Shriners Hospital",                cat: "external",  x: 388, y: 425, w: 80,  h: 80, label: "Shriners Hospital" },
  // Shriners Parking Garage (gray)
  { code: "SPG",name: "Shriners Parking Garage",          cat: "external",  x: 478, y: 425, w: 60,  h: 80, label: "Shriners Parking" },
  // Courtyard by Marriott (gray)
  { code: "CM", name: "Courtyard by Marriott",            cat: "external",  x: 458, y: 510, w: 100, h: 50, label: "Courtyard Marriott" },
  // Glassrock (yellow, mid)
  { code: "V",  name: "Glassrock Building",               cat: "admin",     x: 304, y: 480, w: 51,  h: 33, label: "Glassrock" },
  // Cancer Survivor Park (small light-green, mid)
  { code: "CSP",name: "Cancer Survivor Park",             cat: "amenity",   x: 360, y: 520, w: 100, h: 50, label: "Cancer Survivor Park" },
  // Oak Park Research (yellow X)
  { code: "X",  name: "Oak Park Research Building",       cat: "research",  x: 365, y: 628, w: 44,  h: 43, label: "Oak Park Research" },

  // ============ CENTER: Education / Vanderhoef / Research ============
  // Center for Health and Technology (orange G — large block)
  { code: "G",  name: "Center for Health and Technology", cat: "research",  x: 571, y: 415, w: 96,  h: 61, label: "Center Health & Tech" },
  // Education Building / Medical Library (orange E)
  { code: "E",  name: "Education Building / Medical Library",cat: "education",x: 698, y: 489, w: 60, h: 60, label: "Education" },
  // Administrative Support Building (yellow B) — large
  { code: "B",  name: "Administrative Support Building",  cat: "admin",     x: 772, y: 648, w: 112, h: 81, label: "Admin Support" },
  // Vanderhoef Commons (dark green — outdoor fitness court)
  { code: "VC", name: "Vanderhoef Commons",               cat: "amenity",   x: 642, y: 482, w: 51,  h: 67, label: "Vanderhoef" },
  // Betty Irene Moore Hall (yellow D, below Vanderhoef)
  { code: "D",  name: "Betty Irene Moore Hall",           cat: "admin",     x: 605, y: 570, w: 75,  h: 50, label: "Betty Irene Moore" },
  // Imaging Research Center (small mid)
  { code: "J",  name: "Imaging Research Center",          cat: "research",  x: 560, y: 460, w: 35,  h: 30, label: "Imaging Research" },
  // Research 1, 2, 3 (cluster)
  { code: "O",  name: "Research 1",                       cat: "research",  x: 482, y: 555, w: 60,  h: 32, label: "R1" },
  { code: "Pb", name: "Research 2",                       cat: "research",  x: 482, y: 595, w: 60,  h: 32, label: "R2" },
  { code: "Pc", name: "Research 3",                       cat: "research",  x: 482, y: 635, w: 60,  h: 30, label: "R3" },

  // ============ ACC + EYE INSTITUTE ============
  // Lawrence J. Ellison ACC (cyan)
  { code: "K2", name: "Lawrence J. Ellison Ambulatory Care Center", cat: "clinic", x: 803, y: 473, w: 71, h: 122, label: "ACC" },
  // Eye Institute (cyan, north of ACC)
  { code: "EI", name: "Ernest E. Tschannen Eye Institute",cat: "clinic",    x: 801, y: 411, w: 130, h: 45, label: "Eye Institute" },
  // Same Day Surgery Center (small cyan AA)
  { code: "AA", name: "Same Day Surgery Center",          cat: "clinic",    x: 882, y: 599, w: 42,  h: 34, label: "Same Day Surgery" },
  // P2 (vertical green parking column right of ACC)
  { code: "P2", name: "Parking 2",                        cat: "parking",   x: 887, y: 494, w: 48,  h: 103, label: "P2" },

  // ============ CENTRAL PLANT / FACILITIES (mid-east) ============
  { code: "S",  name: "Facilities Support Services",      cat: "admin",     x: 699, y: 657, w: 64,  h: 50, label: "Facilities" },
  { code: "CP", name: "Central Plant",                    cat: "amenity",   x: 772, y: 648, w: 112, h: 81, label: "Central Plant" }, // overlap with B intentionally

  // ============ AGGIE SQUARE AREA ============
  // Aggie Square (large gray block, central-bottom)
  { code: "C",  name: "Aggie Square",                     cat: "external",  x: 380, y: 580, w: 175, h: 130, label: "Aggie Square" },
  // Aggie Square Parking (green block)
  { code: "P6", name: "Aggie Square Parking",             cat: "parking",   x: 558, y: 712, w: 211, h: 54, label: "P6" },

  // ============ FAR-EAST: MIND, P7, Ronald McDonald, Kiwanis ============
  // MIND Institute (cyan, far right)
  { code: "V2", name: "MIND Institute",                   cat: "clinic",    x: 1041,y: 705, w: 64,  h: 67, label: "MIND Institute" },
  // MIND Lab (small near MIND Institute)
  { code: "ML", name: "MIND Lab",                         cat: "research",  x: 987, y: 678, w: 30,  h: 32, label: "MIND Lab" },
  // P7 (beige staff parking)
  { code: "P7", name: "Parking 7 (staff only)",           cat: "parking",   x: 1128,y: 699, w: 53,  h: 104, label: "P7" },
  // Ronald McDonald House (gray Z, far right)
  { code: "RM", name: "Ronald McDonald House",            cat: "external",  x: 1080,y: 540, w: 90,  h: 75, label: "Ronald McDonald" },
  // Kiwanis Family House (small, far right)
  { code: "KF", name: "Kiwanis Family House",             cat: "external",  x: 1080,y: 700, w: 80,  h: 35, label: "Kiwanis Family" },

  // ============ SOUTH BUILDINGS ============
  // Institute for Regenerative Cures / CTSC (yellow Q)
  { code: "Q",  name: "Institute for Regenerative Cures / CTSC", cat: "research", x: 508, y: 826, w: 106, h: 65, label: "Inst. Regen Cures" },
  // UC Davis Rehabilitation Hospital (navy BB) — south
  { code: "BB", name: "UC Davis Rehabilitation Hospital", cat: "hospital",  x: 685, y: 868, w: 76,  h: 57, label: "Rehab Hospital" },
  // Language Academy of Sacramento (gray, south-mid)
  { code: "LA", name: "Language Academy of Sacramento",   cat: "external",  x: 685, y: 770, w: 100, h: 50, label: "Language Academy" },
  // California Department of Justice (gray, south-east, large)
  { code: "DOJ",name: "California Department of Justice", cat: "external",  x: 800, y: 800, w: 200, h: 140, label: "Dept. of Justice" },
  // Sacramento Employment Development (small, far-south-east)
  { code: "SED",name: "Sacramento Employment Development Office", cat: "external", x: 1080, y: 840, w: 100, h: 60, label: "Sac Employment Dev" },
  // Broadway Building (yellow F, bottom-right)
  { code: "F",  name: "Broadway Building",                cat: "amenity",   x: 939, y: 988, w: 111, h: 38, label: "Broadway Building" },

  // ============ MISC ============
  // Water Tower
  { code: "WT", name: "Water Tower",                      cat: "amenity",   x: 700, y: 250, w: 35,  h: 40, label: "Water Tower" },
];

const PARKING_BUILDING_CODES = new Set(BUILDINGS.filter(b => b.cat === "parking").map(p => p.code));

// Categories (used for color, filter, legend)
const CATEGORIES = {
  hospital:  { label: "Hospital",          color: "#003A70" },
  clinic:    { label: "Clinic / Health",   color: "#00A6CE" },
  research:  { label: "Research",          color: "#7E388C" },
  education: { label: "Education",         color: "#E37222" },
  admin:     { label: "Administrative",    color: "#9C8A4D" },
  amenity:   { label: "Amenity / Common",  color: "#5DA831" },
  external:  { label: "Non-UC Davis",      color: "#727272" },
};

// Parking sub-types
const PARKING_TYPES = {
  staff:   { label: "Staff only",          color: "#C8B27A" },
  patient: { label: "Patient & Visitor",   color: "#1ba0d3" },
};

// Departments / clinics — point users to a building
const DEPARTMENTS = [
  { name: "Emergency Department",          building: "T",  note: "24/7" },
  { name: "Cardiology",                    building: "K2" },
  { name: "Oncology / Cancer Care",        building: "M" },
  { name: "Radiation Oncology",            building: "L" },
  { name: "Ophthalmology",                 building: "EI" },
  { name: "Pediatrics",                    building: "T" },
  { name: "Children's Behavioral Health",  building: "Z" },
  { name: "MIND Institute (Autism, ND)",   building: "V2" },
  { name: "Behavioral Health",             building: "Y" },
  { name: "Rehabilitation",                building: "BB" },
  { name: "Imaging / Radiology",           building: "J" },
  { name: "Pathology Lab",                 building: "I" },
  { name: "Pharmacy (Main)",               building: "T" },
  { name: "Same Day Surgery",              building: "AA" },
  { name: "Medical Records",               building: "N" },
  { name: "Medical Library",               building: "E" },
  { name: "Nursing School",                building: "D" },
  { name: "Information Desk",              building: "T" },
  { name: "Information Desk (ACC)",        building: "K2" },
  { name: "Cafeteria / Eateries",          building: "T" },
  { name: "Police / Public Safety",        building: "PO" },
  { name: "Outpatient Clinic",             building: "K2" },
  { name: "Primary Care",                  building: "K2" },
  { name: "Neurology",                     building: "K2" },
  { name: "Surgery (Inpatient)",           building: "T" },
  { name: "Center for Health & Technology",building: "G" },
  { name: "Regenerative Medicine",         building: "Q" },
];

// Walking-graph nodes — placed along visible streets in the PNG
// Streets: Stockton Blvd (diagonal NW→SE), 2nd Ave, 3rd Ave, Y St, X St, Broadway, 45th, 48th, 49th, 50th
const GRAPH_NODES = {
  // Stockton Blvd (diagonal)
  "stk_top":   { x: 200, y: 100 },
  "stk_mid":   { x: 280, y: 380 },
  "stk_low":   { x: 410, y: 800 },
  "stk_bot":   { x: 510, y: 950 },
  // X Street (~y=380, mid-east)
  "x_45":      { x: 460, y: 385 },
  "x_st":      { x: 720, y: 385 },
  "x_49":      { x: 935, y: 385 },
  "x_50":      { x: 1050,y: 385 },
  // Y Street (~y=505)
  "y_45":      { x: 360, y: 510 },
  "y_st":      { x: 720, y: 505 },
  "y_49":      { x: 935, y: 505 },
  // 2nd Ave (~y=550, runs through Aggie Sq)
  "a2_st":     { x: 720, y: 555 },
  "a2_49":     { x: 935, y: 555 },
  // 3rd Ave (~y=755)
  "a3_st":     { x: 660, y: 760 },
  "a3_49":     { x: 935, y: 760 },
  "a3_50":     { x: 1100,y: 760 },
  // Broadway (~y=970)
  "bw_st":     { x: 660, y: 970 },
  "bw_49":     { x: 935, y: 970 },
  // Internal building access nodes (snap-points near building entrances)
  "n_med":     { x: 416, y: 295 }, // Medical Center main entrance
  "n_cancer":  { x: 615, y: 320 }, // Cancer Center
  "n_acc":     { x: 838, y: 535 }, // ACC main
  "n_eye":     { x: 866, y: 433 }, // Eye Institute
  "n_mind":    { x: 1073,y: 738 }, // MIND
  "n_aggie":   { x: 467, y: 645 }, // Aggie Square
  "n_aggiep":  { x: 663, y: 740 }, // Aggie Sq Parking
  "n_p3":      { x: 333, y: 337 }, // P3
  "n_p2":      { x: 911, y: 545 }, // P2
  "n_p4":      { x: 832, y: 325 }, // P4
  "n_p7":      { x: 1154,y: 750 }, // P7
  "n_p6":      { x: 663, y: 740 }, // P6 same as aggiep
  "n_p1":      { x: 270, y: 200 }, // P1
  "n_p5":      { x: 720, y: 315 }, // P5
  "n_rehab":   { x: 723, y: 895 }, // Rehab BB
  "n_irc":     { x: 561, y: 858 }, // Inst Regen Cures
  "n_brdwy":   { x: 994, y: 1007 },// Broadway Building
  "n_addmin":  { x: 828, y: 690 }, // Admin Support
  "n_chc":     { x: 619, y: 445 }, // CHT
  "n_edu":     { x: 728, y: 519 }, // Education
};

// Graph edges (bidirectional) — connect nodes that share streets / are walkable neighbors
const GRAPH_EDGES = [
  // Stockton chain
  ["stk_top","stk_mid"], ["stk_mid","stk_low"], ["stk_low","stk_bot"],
  // X Street
  ["x_45","x_st"], ["x_st","x_49"], ["x_49","x_50"],
  // Y Street
  ["y_45","y_st"], ["y_st","y_49"],
  // 2nd Ave
  ["a2_st","a2_49"],
  // 3rd Ave
  ["a3_st","a3_49"], ["a3_49","a3_50"],
  // Broadway
  ["bw_st","bw_49"],
  // 45th north-south (connects X-Y)
  ["x_45","y_45"], ["y_45","stk_low"],
  // Stockton St vertical (45th continuation)
  ["stk_mid","x_45"],
  // ~Stockton Blvd / 45th going through
  ["x_st","y_st"], ["y_st","a2_st"], ["a2_st","a3_st"], ["a3_st","bw_st"],
  ["x_49","y_49"], ["y_49","a2_49"], ["a2_49","a3_49"], ["a3_49","bw_49"],
  // Connect building entrances to nearest graph node
  ["n_med","stk_mid"], ["n_med","x_45"], ["n_med","x_st"],
  ["n_cancer","x_st"], ["n_cancer","x_45"],
  ["n_acc","y_st"], ["n_acc","y_49"],
  ["n_eye","x_st"], ["n_eye","y_st"], ["n_eye","x_49"],
  ["n_mind","a3_49"], ["n_mind","a3_50"],
  ["n_aggie","y_st"], ["n_aggie","a2_st"], ["n_aggie","y_45"],
  ["n_aggiep","a2_st"], ["n_aggiep","a3_st"],
  ["n_p3","x_45"], ["n_p3","stk_mid"],
  ["n_p2","y_49"], ["n_p2","a2_49"],
  ["n_p4","x_49"], ["n_p4","x_st"],
  ["n_p7","a3_50"],
  ["n_p1","stk_top"], ["n_p1","stk_mid"],
  ["n_p5","x_st"], ["n_p5","x_49"],
  ["n_rehab","a3_st"], ["n_rehab","bw_st"],
  ["n_irc","stk_low"], ["n_irc","a3_st"],
  ["n_brdwy","bw_49"], ["n_brdwy","a3_50"],
  ["n_addmin","a2_49"], ["n_addmin","a3_49"],
  ["n_chc","y_st"], ["n_chc","x_st"],
  ["n_edu","y_st"], ["n_edu","a2_st"],
];

// Each building "owns" a graph entrance node so routing can find a start/end
const BUILDING_ENTRY = {
  T:"n_med", G:"n_chc", U:"n_med", I:"n_med", W:"n_med", N:"n_p1",
  M:"n_cancer", L:"n_cancer", A:"n_p4",
  K:"n_p1", Y:"stk_top", Z:"stk_top", Hp:"stk_mid", Sh:"stk_mid",
  D1:"stk_mid", D2:"stk_mid", WF:"stk_mid", T1:"stk_mid", T2:"stk_top",
  GG:"n_med", PO:"n_med",
  SH:"y_45", SPG:"y_45", CM:"y_45", V:"y_45", CSP:"y_45", X:"y_45",
  E:"n_edu", B:"n_addmin", VC:"n_edu", D:"n_edu", J:"n_chc",
  O:"n_aggie", Pb:"n_aggie", Pc:"n_aggie",
  K2:"n_acc", EI:"n_eye", AA:"n_acc",
  S:"n_addmin", CP:"n_addmin",
  C:"n_aggie",
  V2:"n_mind", ML:"n_mind", RM:"a2_49", KF:"a3_50",
  Q:"n_irc", BB:"n_rehab", LA:"a3_st", DOJ:"a3_49", SED:"a3_50", F:"n_brdwy",
  WT:"x_st",
  // Parking entries
  P1:"n_p1", P2:"n_p2", P3:"n_p3", P4:"n_p4", P5:"n_p5", P6:"n_p6", P7:"n_p7",
};

// Shuttle stops (approximate, from VP/EP markers along Stockton)
const SHUTTLE_STOPS = [
  { id: "sh_acc",     name: "ACC / Eye Institute",     x: 800, y: 470 },
  { id: "sh_med",     name: "Medical Center Main",     x: 410, y: 305 },
  { id: "sh_cancer",  name: "Cancer Center",           x: 615, y: 380 },
  { id: "sh_aggie",   name: "Aggie Square",            x: 470, y: 700 },
  { id: "sh_mind",    name: "MIND Institute",          x: 1015,y: 760 },
  { id: "sh_rehab",   name: "Rehab Hospital",          x: 720, y: 920 },
];

window.MAP_IMG = MAP_IMG;
window.BUILDINGS = BUILDINGS;
window.PARKING_BUILDING_CODES = PARKING_BUILDING_CODES;
window.CATEGORIES = CATEGORIES;
window.PARKING_TYPES = PARKING_TYPES;
window.DEPARTMENTS = DEPARTMENTS;
window.GRAPH_NODES = GRAPH_NODES;
window.GRAPH_EDGES = GRAPH_EDGES;
window.BUILDING_ENTRY = BUILDING_ENTRY;
window.SHUTTLE_STOPS = SHUTTLE_STOPS;
